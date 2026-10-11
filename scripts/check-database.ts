import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  cp,
  mkdtemp,
  mkdir,
  appendFile,
  writeFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../lib/prisma";
import {
  getWorkspaceData,
  mutateWorkspace,
  findUserByEmail,
} from "../lib/data";
import { WORKSPACE_ID } from "../lib/demo";
import { migrateDatabase } from "./migrate";

async function main() {
  if (process.env.DEMO_MODE === "true")
    throw new Error(
      "Use DEMO_MODE=false with a seeded production-mode test database to verify PostgreSQL persistence.",
    );
  const reapplied = await migrateDatabase();
  if (reapplied.length)
    throw new Error(
      "Database verification requires migrations to be applied first.",
    );
  const data = await getWorkspaceData();
  const actor = data.operators[0];
  if (!actor) throw new Error("No seeded operator found.");
  const channel = data.channels[0];
  if (!channel) throw new Error("No seeded channel found.");
  const prefix = `database-check-${randomUUID()}`;
  const initialUser = await findUserByEmail(actor.email);
  await promisify(execFile)(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    {
      env: {
        ...process.env,
        OPERATOR_1_PASSWORD: randomUUID(),
        OPERATOR_2_PASSWORD: randomUUID(),
      },
    },
  );
  const afterSeed = await findUserByEmail(actor.email);
  if (!initialUser || initialUser.passwordHash !== afterSeed?.passwordHash)
    throw new Error("Repeated seed changed an existing operator password.");
  const migrationCopy = await mkdtemp(
    path.join(os.tmpdir(), "move-migration-check-"),
  );
  try {
    await cp(path.resolve("prisma/migrations"), migrationCopy, {
      recursive: true,
    });
    await appendFile(
      path.join(migrationCopy, "20261010000000_init/migration.sql"),
      "\n-- Changed historical migration\n",
    );
    let rejectedChange = false;
    try {
      await migrateDatabase(process.env.DATABASE_URL, migrationCopy);
    } catch (error) {
      rejectedChange =
        error instanceof Error &&
        error.message.includes("changed after it was applied");
    }
    if (!rejectedChange)
      throw new Error("Migration checksum mismatch was not rejected.");
    await cp(
      path.resolve("prisma/migrations/20261010000000_init/migration.sql"),
      path.join(migrationCopy, "20261010000000_init/migration.sql"),
    );
    const brokenName = "99999999999999_test_failure";
    await mkdir(path.join(migrationCopy, brokenName));
    await writeFile(
      path.join(migrationCopy, brokenName, "migration.sql"),
      'CREATE TABLE "_move_migration_probe" (id TEXT); SELECT * FROM "missing_move_migration_probe";',
    );
    let rejectedFailure = false;
    try {
      await migrateDatabase(process.env.DATABASE_URL, migrationCopy);
    } catch {
      rejectedFailure = true;
    }
    const probe = await prisma.$queryRaw<
      { table_name: string | null }[]
    >`SELECT to_regclass('_move_migration_probe')::text AS table_name`;
    const failedRecords = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT COUNT(*) FROM "_prisma_migrations" WHERE migration_name = ${brokenName}`;
    if (
      !rejectedFailure ||
      probe[0]?.table_name !== null ||
      Number(failedRecords[0]?.count) !== 0
    )
      throw new Error(
        "Failed migration did not roll back its SQL and ledger record.",
      );
  } finally {
    await rm(migrationCopy, { recursive: true, force: true });
  }
  try {
    await Promise.all(
      [1, 2, 3].map((index) =>
        mutateWorkspace(
          actor.id,
          "TEST_DATABASE_WRITE",
          `${prefix}-${index}`,
          (workspace) => {
            workspace.projects.push({
              id: `${prefix}-${index}`,
              title: `Database verification ${index}`,
              channelId: channel.id,
              operatorId: actor.id,
              stage: "IDEA",
              format: "CAROUSEL",
              draftCopy: "",
              sourceUrls: [],
              dueAt: null,
              productionMinutes: 0,
              revisions: [],
              updatedAt: new Date().toISOString(),
            });
            workspace.assets.push({
              id: `${prefix}-asset-${index}`,
              projectId: `${prefix}-${index}`,
              kind: "IMAGE",
              url: `https://example.com/database-test-${index}.jpg`,
              credit: "Database test fixture, not a fetched or uploaded asset.",
              width: null,
              height: null,
              approved: false,
              createdAt: new Date().toISOString(),
            });
          },
        ),
      ),
    );
    const reloaded = await getWorkspaceData();
    if (
      reloaded.projects.filter((project) => project.id.startsWith(prefix))
        .length !== 3
    )
      throw new Error("Concurrent writes lost data.");
    if (
      reloaded.assets.filter((asset) => asset.projectId.startsWith(prefix))
        .length !== 3
    )
      throw new Error("Project assets were not persisted.");
    if (
      reloaded.assets
        .filter((asset) => asset.projectId.startsWith(prefix))
        .some(
          (asset) =>
            asset.approved || asset.width !== null || asset.height !== null,
        )
    )
      throw new Error("Asset approval or dimensions were invented.");
    if (
      reloaded.audit.filter((entry) => entry.entityId.startsWith(prefix))
        .length !== 3
    )
      throw new Error("Concurrent writes were not audited.");
    const credentials = await prisma.integrationCredential.findMany({
      where: { workspaceId: WORKSPACE_ID },
      select: { provider: true },
    });
    console.log(
      `PostgreSQL verified: migration idempotency, checksum rejection and failure rollback, non-destructive reseeding, normalized records and project assets, concurrent writes, audit logs and credentials table (${credentials.length} binding(s), values not inspected).`,
    );
  } finally {
    await mutateWorkspace(
      actor.id,
      "TEST_DATABASE_CLEANUP",
      prefix,
      (workspace) => {
        workspace.assets = workspace.assets.filter(
          (asset) => !asset.projectId.startsWith(prefix),
        );
        workspace.projects = workspace.projects.filter(
          (project) => !project.id.startsWith(prefix),
        );
      },
    );
  }
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Database verification failed",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
