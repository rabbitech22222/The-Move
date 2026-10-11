import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { createDemoData, createWorkspaceBase, WORKSPACE_ID } from '../lib/demo';
import { hashPassword, persistWorkspace } from '../lib/data';

async function main() {
  const demo = process.env.DEMO_MODE === 'true';
  const operatorPasswords = demo
    ? ['move-demo-2026', 'move-demo-2026']
    : [process.env.OPERATOR_1_PASSWORD, process.env.OPERATOR_2_PASSWORD];
  const data = demo ? createDemoData() : createWorkspaceBase(false);
  if (!demo) {
    data.operators[0].email = (process.env.OPERATOR_1_EMAIL ?? 'operator1@themove.local').toLowerCase();
    data.operators[1].email = (process.env.OPERATOR_2_EMAIL ?? 'operator2@themove.local').toLowerCase();
  }
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${WORKSPACE_ID}))`;
    const existing = await tx.workspace.findUnique({ where: { id: WORKSPACE_ID } });
    if (existing) {
      if (existing.isDemo !== demo) throw new Error('Refusing to convert an existing workspace between demo and production. Use a separate database.');
      console.log('Workspace already exists; preserving accounts, passwords, content, and history.');
      return;
    }
    if (operatorPasswords.some(password => !password || password.length < 12)) {
      throw new Error('Set OPERATOR_1_PASSWORD and OPERATOR_2_PASSWORD to distinct passwords of at least 12 characters. Demo defaults are available only when DEMO_MODE=true.');
    }
    if (!demo && operatorPasswords[0] === operatorPasswords[1]) throw new Error('Production operator passwords must be distinct.');
    await tx.workspace.create({ data: { id: WORKSPACE_ID, name: data.workspaceName, isDemo: demo } });
    for (const [index, operator] of data.operators.entries()) {
      await tx.user.create({ data: { ...operator, workspaceId: WORKSPACE_ID, passwordHash: hashPassword(operatorPasswords[index]!) } });
    }
    await tx.user.create({ data: { id: 'system', workspaceId: WORKSPACE_ID, name: 'Background jobs', email: 'system@themove.invalid', role: 'VIEWER', passwordHash: 'disabled', isSystem: true } });
    await persistWorkspace(tx, data);
  }, { timeout: 120_000, maxWait: 30_000 });
  console.log(demo ? 'Demo database fixtures seeded. Local demo mode uses .move-data JSON; database fixtures are for inspection.' : 'Production workspace initialized with disconnected accounts and no invented metrics.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
