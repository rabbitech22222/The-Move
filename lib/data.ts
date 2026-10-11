import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import type { WorkspaceData, Operator } from "./domain";
import { createDemoData, demoOperators, WORKSPACE_ID } from "./demo";
import { prisma } from "./prisma";

type Transaction = Prisma.TransactionClient;
type AuthUser = Operator & { passwordHash: string };
const shared = globalThis as unknown as { moveDataLock?: Promise<void> };
const isDemo = () => process.env.DEMO_MODE === "true";
const dataFile = () =>
  path.join(
    process.env.MOVE_DATA_DIR ?? path.join(process.cwd(), ".move-data"),
    "workspace.json",
  );
const asDate = (value: string) => new Date(value);
const optionalDate = (value: string | null) =>
  value === null ? null : asDate(value);
const iso = (value: Date) => value.toISOString();
const day = (value: Date) => value.toISOString().slice(0, 10);
const optionalIso = (value: Date | null) => value?.toISOString() ?? null;

async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const preceding = shared.moveDataLock ?? Promise.resolve();
  let release!: () => void;
  shared.moveDataLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await preceding;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function withDemoFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const filename = dataFile();
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const lock = `${filename}.lock`;
  const token = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + 60_000;
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600);
      try {
        await handle.writeFile(token);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Recover only a lock owned by a process that no longer exists. An empty
      // new lock is allowed 30 seconds for its owner to write the token.
      try {
        const owner = await readFile(lock, "utf8");
        const pid = Number(owner.split(":")[0]);
        let abandoned = false;
        if (Number.isSafeInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (check) {
            abandoned = (check as NodeJS.ErrnoException).code === "ESRCH";
          }
        } else abandoned = Date.now() - (await stat(lock)).mtimeMs > 30_000;
        if (abandoned && (await readFile(lock, "utf8")) === owner)
          await unlink(lock);
      } catch (check) {
        if ((check as NodeJS.ErrnoException).code !== "ENOENT") throw check;
      }
      if (Date.now() >= deadline)
        throw new Error(
          "Demo data is busy. Another process still holds the persistence lock; retry after its task finishes.",
        );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    if ((await readFile(lock, "utf8").catch(() => "")) === token)
      await unlink(lock);
  }
}

async function writeDemo(data: WorkspaceData) {
  const filename = dataFile();
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, filename);
}

async function readDemo(): Promise<WorkspaceData> {
  try {
    const data = JSON.parse(
      await readFile(dataFile(), "utf8"),
    ) as WorkspaceData;
    if (
      data.demo !== true ||
      !Array.isArray(data.channels) ||
      !Array.isArray(data.projects)
    ) {
      throw new Error(
        "Invalid demo data. Preserve the file and fix its structure; it was not replaced.",
      );
    }
    if (data.assets === undefined) data.assets = [];
    if (!Array.isArray(data.assets))
      throw new Error("Invalid demo assets. Existing data was preserved.");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const data = createDemoData();
    await writeDemo(data);
    return data;
  }
}

async function readDatabase(tx: Transaction): Promise<WorkspaceData> {
  const where = { workspaceId: WORKSPACE_ID };
  const workspace = await tx.workspace.findUnique({
    where: { id: WORKSPACE_ID },
  });
  if (!workspace)
    throw new Error(
      "Workspace is not initialized. Run npm run db:migrate and npm run db:seed.",
    );
  if (workspace.isDemo)
    throw new Error(
      "This database contains demo data. Set DEMO_MODE=true for the local JSON demo or seed a separate production database.",
    );
  const [
    operators,
    channels,
    accountMetrics,
    posts,
    postMetrics,
    sources,
    topics,
    projects,
    assets,
    templates,
    designs,
    tasks,
    events,
    approvals,
    publications,
    finance,
    audit,
    recommendations,
  ] = await Promise.all([
    tx.user.findMany({
      where: { ...where, isSystem: false },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { id: "asc" },
    }),
    tx.socialAccount.findMany({
      where,
      include: { editorialRules: { orderBy: { version: "asc" } } },
      orderBy: { id: "asc" },
    }),
    tx.accountMetric.findMany({ where, orderBy: { date: "asc" } }),
    tx.post.findMany({ where, orderBy: { publishedAt: "desc" } }),
    tx.postMetric.findMany({ where, orderBy: { date: "asc" } }),
    tx.source.findMany({ where, orderBy: { name: "asc" } }),
    tx.topic.findMany({ where, orderBy: { retrievedAt: "desc" } }),
    tx.editorialProject.findMany({
      where,
      include: {
        references: { orderBy: { position: "asc" } },
        revisions: { orderBy: { at: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    tx.asset.findMany({ where, orderBy: { createdAt: "desc" } }),
    tx.canvaTemplate.findMany({ where }),
    tx.generatedDesign.findMany({ where }),
    tx.agentTask.findMany({ where, orderBy: { createdAt: "desc" } }),
    tx.agentEvent.findMany({ where, orderBy: { at: "desc" } }),
    tx.approval.findMany({ where }),
    tx.scheduledPublication.findMany({ where }),
    tx.financeEntry.findMany({ where }),
    tx.auditLog.findMany({ where, orderBy: { at: "desc" } }),
    tx.recommendation.findMany({ where }),
  ]);
  return {
    demo: false,
    workspaceName: workspace.name,
    operators,
    channels: channels.map((row) => ({
      id: row.id,
      name: row.name,
      handle: row.handle,
      accent: row.accent,
      connected: row.connected,
      ...(row.platformAccountId
        ? { platformAccountId: row.platformAccountId }
        : {}),
      guidelines: row.guidelines,
      guidelineVersion: row.guidelineVersion,
      guidelineHistory: row.editorialRules.map((rule) => ({
        version: rule.version,
        guidelines: rule.content,
        changedAt: iso(rule.createdAt),
      })),
    })),
    accountMetrics: accountMetrics.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      date: day(row.date),
      followers: row.followers,
      followerDelta: row.followerDelta,
      views: row.views,
      reach: row.reach,
      engagements: row.engagements,
      postsPublished: row.postsPublished,
      source: row.source,
      syncedAt: iso(row.syncedAt),
    })),
    posts: posts.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      title: row.title,
      format: row.format,
      category: row.category,
      publishedAt: iso(row.publishedAt),
      permalink: row.permalink,
      source: row.source,
    })),
    postMetrics: postMetrics.map((row) => ({
      id: row.id,
      postId: row.postId,
      date: day(row.date),
      views: row.views,
      reach: row.reach,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
      shares: row.shares,
      source: row.source,
      syncedAt: iso(row.syncedAt),
    })),
    sources: sources.map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type,
      enabled: row.enabled,
      rights: row.rights,
      lastFetchedAt: optionalIso(row.lastFetchedAt),
      lastError: row.lastError,
    })),
    topics: topics.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      sourceId: row.sourceId,
      sourceUrl: row.sourceUrl,
      publishedAt: optionalIso(row.publishedAt),
      retrievedAt: iso(row.retrievedAt),
      relevance: row.relevance,
      confidence: row.confidence,
      scoreExplanation: row.scoreExplanation,
      recommendedChannelId: row.recommendedChannelId,
      format: row.format,
      status: row.status,
      uncertainClaims: row.uncertainClaims,
      rights: row.rights,
    })),
    projects: projects.map((row) => ({
      id: row.id,
      title: row.title,
      channelId: row.channelId,
      operatorId: row.operatorId,
      stage: row.stage,
      format: row.format,
      draftCopy: row.draftCopy,
      sourceUrls: row.references.map((ref) => ref.url),
      dueAt: optionalIso(row.dueAt),
      productionMinutes: row.productionMinutes,
      revisions: row.revisions.map((revision) => ({
        at: iso(revision.at),
        actorId: revision.actorId,
        note: revision.note,
      })),
      updatedAt: iso(row.updatedAt),
    })),
    assets: assets.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      kind: row.kind,
      url: row.url,
      credit: row.credit ?? "",
      width: row.width,
      height: row.height,
      approved: row.approved,
      createdAt: iso(row.createdAt),
    })),
    templates: templates.map((row) => ({
      id: row.id,
      name: row.name,
      channelId: row.channelId,
      format: row.format,
      operatorId: row.operatorId,
      designId: row.designId,
      width: row.width,
      height: row.height,
      inspectedAt: optionalIso(row.inspectedAt),
      fields: row.fields,
      status: row.status,
      approved: row.approved,
    })),
    designs: designs.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      templateId: row.templateId,
      status: row.status,
      editUrl: row.editUrl,
      externalId: row.externalId,
      error: row.error,
      createdAt: iso(row.createdAt),
    })),
    tasks: tasks.map((row) => ({
      id: row.id,
      agent: row.agent,
      kind: row.kind,
      status: row.status,
      progress: row.progress,
      message: row.message,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      result: row.result,
      isDemo: row.isDemo,
    })),
    events: events.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      at: iso(row.at),
      status: row.status,
      message: row.message,
    })),
    approvals: approvals.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      actorId: row.actorId,
      kind: row.kind,
      approvedAt: iso(row.approvedAt),
      revisionAt: iso(row.revisionAt),
      ...(row.payloadHash ? { payloadHash: row.payloadHash } : {}),
    })),
    publications: publications.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      scheduledAt: iso(row.scheduledAt),
      status: row.status,
      platformPostId: row.platformPostId,
      error: row.error,
      mediaUrl: row.mediaUrl,
      caption: row.caption,
    })),
    finance: finance.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      type: row.type,
      amount: row.amount.toNumber(),
      currency: row.currency,
      date: day(row.date),
      description: row.description,
      source: row.source,
    })),
    audit: audit.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      entityId: row.entityId,
      at: iso(row.at),
      details: row.details,
    })),
    recommendations: recommendations.map((row) => ({
      id: row.id,
      title: row.title,
      rationale: row.rationale,
      status: row.status,
      createdAt: iso(row.createdAt),
      experimentResult: row.experimentResult,
    })),
  };
}

// Persistence is normalized: independent entities, foreign keys, unique keys and
// time-series indices. Private token fields are never exposed or overwritten
// by the public workspace snapshot.
export async function persistWorkspace(
  tx: Transaction,
  data: WorkspaceData,
): Promise<void> {
  const scoped = { workspaceId: WORKSPACE_ID };
  await tx.workspace.update({
    where: { id: WORKSPACE_ID },
    data: { name: data.workspaceName },
  });
  for (const row of data.channels) {
    const values = {
      ...scoped,
      name: row.name,
      handle: row.handle,
      accent: row.accent,
      connected: row.connected,
      platformAccountId: row.platformAccountId ?? null,
      guidelines: row.guidelines,
      guidelineVersion: row.guidelineVersion,
    };
    await tx.socialAccount.upsert({
      where: { id: row.id },
      create: { id: row.id, ...values },
      update: values,
    });
    await tx.editorialRule.upsert({
      where: {
        channelId_version: { channelId: row.id, version: row.guidelineVersion },
      },
      create: {
        ...scoped,
        channelId: row.id,
        version: row.guidelineVersion,
        content: row.guidelines,
      },
      update: {},
    });
  }
  for (const row of data.sources) {
    const values = {
      ...row,
      ...scoped,
      lastFetchedAt: optionalDate(row.lastFetchedAt),
    };
    await tx.source.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.topics) {
    const values = {
      ...row,
      ...scoped,
      publishedAt: optionalDate(row.publishedAt),
      retrievedAt: asDate(row.retrievedAt),
    };
    await tx.topic.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.projects) {
    const { revisions, sourceUrls, ...fields } = row;
    const values = {
      ...fields,
      ...scoped,
      dueAt: optionalDate(row.dueAt),
      updatedAt: asDate(row.updatedAt),
    };
    await tx.editorialProject.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
    await tx.projectSourceReference.deleteMany({
      where: { projectId: row.id },
    });
    if (sourceUrls.length)
      await tx.projectSourceReference.createMany({
        data: sourceUrls.map((url, position) => ({
          projectId: row.id,
          url,
          position,
        })),
      });
    await tx.projectRevision.deleteMany({ where: { projectId: row.id } });
    if (revisions.length)
      await tx.projectRevision.createMany({
        data: revisions.map((revision) => ({
          projectId: row.id,
          ...revision,
          at: asDate(revision.at),
        })),
      });
  }
  for (const row of data.assets) {
    const project = data.projects.find(
      (project) => project.id === row.projectId,
    );
    if (!project)
      throw new Error("Asset must belong to an existing workspace project.");
    const values = {
      ...row,
      ...scoped,
      channelId: project.channelId,
      createdAt: asDate(row.createdAt),
    };
    await tx.asset.upsert({
      where: { id: row.id },
      create: {
        ...values,
        name: path.basename(new URL(row.url).pathname) || "Submitted media",
        mimeType: row.kind === "VIDEO" ? "video/unknown" : "image/unknown",
        rights:
          "User-submitted external media; rights must be verified by an operator.",
      },
      update: values,
    });
  }
  for (const row of data.templates) {
    const values = {
      ...row,
      ...scoped,
      inspectedAt: optionalDate(row.inspectedAt),
    };
    await tx.canvaTemplate.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.designs) {
    const values = { ...row, ...scoped, createdAt: asDate(row.createdAt) };
    await tx.generatedDesign.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.posts) {
    const values = { ...row, ...scoped, publishedAt: asDate(row.publishedAt) };
    await tx.post.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.accountMetrics) {
    const values = {
      ...row,
      ...scoped,
      date: asDate(row.date),
      syncedAt: asDate(row.syncedAt),
    };
    await tx.accountMetric.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.postMetrics) {
    const values = {
      ...row,
      ...scoped,
      date: asDate(row.date),
      syncedAt: asDate(row.syncedAt),
    };
    await tx.postMetric.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.tasks) {
    const values = {
      ...row,
      ...scoped,
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt),
    };
    await tx.agentTask.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.events) {
    const values = { ...row, ...scoped, at: asDate(row.at) };
    await tx.agentEvent.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.approvals) {
    const values = {
      ...row,
      ...scoped,
      approvedAt: asDate(row.approvedAt),
      revisionAt: asDate(row.revisionAt),
      payloadHash: row.payloadHash ?? null,
    };
    await tx.approval.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.publications) {
    const values = { ...row, ...scoped, scheduledAt: asDate(row.scheduledAt) };
    await tx.scheduledPublication.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.finance) {
    const values = { ...row, ...scoped, date: asDate(row.date) };
    await tx.financeEntry.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  for (const row of data.audit) {
    const values = { ...row, ...scoped, at: asDate(row.at) };
    await tx.auditLog.upsert({
      where: { id: row.id },
      create: values,
      update: {},
    });
  }
  for (const row of data.recommendations) {
    const values = { ...row, ...scoped, createdAt: asDate(row.createdAt) };
    await tx.recommendation.upsert({
      where: { id: row.id },
      create: values,
      update: values,
    });
  }
  // Remove deleted entities from leaves to parents; audit history is append-only.
  await tx.postMetric.deleteMany({
    where: { ...scoped, id: { notIn: data.postMetrics.map((row) => row.id) } },
  });
  await tx.accountMetric.deleteMany({
    where: {
      ...scoped,
      id: { notIn: data.accountMetrics.map((row) => row.id) },
    },
  });
  await tx.agentEvent.deleteMany({
    where: { ...scoped, id: { notIn: data.events.map((row) => row.id) } },
  });
  await tx.approval.deleteMany({
    where: { ...scoped, id: { notIn: data.approvals.map((row) => row.id) } },
  });
  await tx.scheduledPublication.deleteMany({
    where: { ...scoped, id: { notIn: data.publications.map((row) => row.id) } },
  });
  await tx.generatedDesign.deleteMany({
    where: { ...scoped, id: { notIn: data.designs.map((row) => row.id) } },
  });
  await tx.asset.deleteMany({
    where: { ...scoped, id: { notIn: data.assets.map((row) => row.id) } },
  });
  await tx.editorialProject.deleteMany({
    where: { ...scoped, id: { notIn: data.projects.map((row) => row.id) } },
  });
  await tx.topic.deleteMany({
    where: { ...scoped, id: { notIn: data.topics.map((row) => row.id) } },
  });
  await tx.source.deleteMany({
    where: { ...scoped, id: { notIn: data.sources.map((row) => row.id) } },
  });
  await tx.canvaTemplate.deleteMany({
    where: { ...scoped, id: { notIn: data.templates.map((row) => row.id) } },
  });
  await tx.post.deleteMany({
    where: { ...scoped, id: { notIn: data.posts.map((row) => row.id) } },
  });
  await tx.agentTask.deleteMany({
    where: { ...scoped, id: { notIn: data.tasks.map((row) => row.id) } },
  });
  await tx.financeEntry.deleteMany({
    where: { ...scoped, id: { notIn: data.finance.map((row) => row.id) } },
  });
  await tx.recommendation.deleteMany({
    where: {
      ...scoped,
      id: { notIn: data.recommendations.map((row) => row.id) },
    },
  });
  await tx.socialAccount.deleteMany({
    where: { ...scoped, id: { notIn: data.channels.map((row) => row.id) } },
  });
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  if (isDemo()) return serialized(() => withDemoFileLock(readDemo));
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required. To use explicitly labeled local fixtures, set DEMO_MODE=true.",
    );
  return prisma.$transaction((tx) => readDatabase(tx), {
    isolationLevel: "RepeatableRead",
    timeout: 30_000,
  });
}

export async function mutateWorkspace(
  actorId: string,
  action: string,
  entityId: string,
  mutation: (data: WorkspaceData) => void | Promise<void>,
): Promise<WorkspaceData> {
  const apply = async (data: WorkspaceData) => {
    if (
      actorId !== "system" &&
      !data.operators.some((operator) => operator.id === actorId)
    )
      throw new Error("Unknown workspace actor.");
    await mutation(data);
    data.audit.unshift({
      id: randomUUID(),
      actorId,
      action,
      entityId,
      at: new Date().toISOString(),
      details: `${action} ${entityId}`,
    });
    return data;
  };
  if (isDemo())
    return serialized(() =>
      withDemoFileLock(async () => {
        const data = await apply(await readDemo());
        await writeDemo(data);
        return data;
      }),
    );
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for production persistence.");
  return prisma.$transaction(
    async (tx) => {
      // Every API process and BullMQ worker takes the same PostgreSQL lock before
      // reading. Waiting writers then observe the previously committed snapshot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${WORKSPACE_ID}))`;
      const data = await apply(await readDatabase(tx));
      await persistWorkspace(tx, data);
      return data;
    },
    { timeout: 60_000, maxWait: 60_000 },
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isDemo()) {
    const operator = demoOperators.find((user) => user.email === normalized);
    return operator
      ? { ...operator, passwordHash: hashPassword("move-demo-2026") }
      : null;
  }
  if (!process.env.DATABASE_URL) return null;
  return prisma.user.findFirst({
    where: { workspaceId: WORKSPACE_ID, email: normalized, isSystem: false },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
    },
  });
}

export async function getOperatorById(id: string): Promise<Operator | null> {
  if (isDemo()) return demoOperators.find((user) => user.id === id) ?? null;
  if (!process.env.DATABASE_URL) return null;
  return prisma.user.findFirst({
    where: { id, workspaceId: WORKSPACE_ID, isSystem: false },
    select: { id: true, name: true, email: true, role: true },
  });
}
