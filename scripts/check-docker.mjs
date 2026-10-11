import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

// Isolated Compose project, Redis and disposable database; existing data stays intact.
const suffix = randomBytes(6).toString("hex");
const databaseName = `move_docker_check_${suffix}`;
const projectName = `move-check-${suffix}`;
const port = Number(process.env.DOCKER_CHECK_PORT || 3100);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("hex");
const sourceUrl = new URL(process.env.DATABASE_URL);
assert(
  ["localhost", "127.0.0.1"].includes(sourceUrl.hostname),
  "Use local PostgreSQL for this disposable check.",
);
const client = new pg.Client({ connectionString: sourceUrl.toString() });
const temp = await mkdtemp(path.join(tmpdir(), "move-docker-check-"));
const composeFile = path.join(temp, "compose.yml");
let databaseCreated = false;
let containersCreated = false;
let cookie;
const environment = { ...process.env };
if (process.platform === "linux" && process.cwd().startsWith("/workspace/"))
  environment.DOCKER_CONFIG ||= "/workspace/.docker-local";
function docker(args) {
  return execFileSync("docker", args, {
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function compose(args) {
  return docker(["compose", "-p", projectName, "-f", composeFile, ...args]);
}
async function ready() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      if (
        (
          await fetch(`${origin}/api/health`, {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      )
        return;
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Docker app readiness timed out.");
}
async function request(endpoint, payload) {
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  assert(
    response.ok,
    `${endpoint}: ${response.status} / ${result.code || "unknown"}`,
  );
  if (endpoint === "auth" && payload) {
    cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert(cookie, "Signed session was not issued.");
  }
  return result.data;
}
try {
  const postgresId = docker(["compose", "ps", "-q", "postgres"]);
  assert(postgresId, "Start docker compose up -d postgres redis first.");
  const networks = JSON.parse(
    docker([
      "inspect",
      "--format",
      "{{json .NetworkSettings.Networks}}",
      postgresId,
    ]),
  );
  const network = Object.keys(networks)[0];
  assert(network);
  await client.connect();
  await client.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const testUrl = new URL(sourceUrl);
  testUrl.hostname = "postgres";
  testUrl.pathname = `/${databaseName}`;
  Object.assign(environment, {
    MOVE_CHECK_DATABASE_URL: testUrl.toString(),
    MOVE_CHECK_PASSWORD_1: password,
    MOVE_CHECK_PASSWORD_2: randomBytes(24).toString("hex"),
    MOVE_CHECK_SESSION: randomBytes(48).toString("hex"),
    MOVE_CHECK_ENCRYPTION: randomBytes(32).toString("hex"),
  });
  // Values remain in memory. The temporary file contains variable references only.
  const common = `    image: the-move-os:local
    env_file: ${JSON.stringify(path.resolve(".env"))}
    environment:
      DEMO_MODE: "false"
      APP_URL: ${JSON.stringify(origin)}
      DATABASE_URL: \${MOVE_CHECK_DATABASE_URL}
      REDIS_URL: redis://redis_check:6379
      SESSION_SECRET: \${MOVE_CHECK_SESSION}
      TOKEN_ENCRYPTION_KEY: \${MOVE_CHECK_ENCRYPTION}
      OPERATOR_1_EMAIL: check1@themove.local
      OPERATOR_2_EMAIL: check2@themove.local
      OPERATOR_1_PASSWORD: \${MOVE_CHECK_PASSWORD_1}
      OPERATOR_2_PASSWORD: \${MOVE_CHECK_PASSWORD_2}
    networks: [default, infrastructure]
`;
  await writeFile(
    composeFile,
    `services:
  redis_check:
    image: redis:7-alpine
  app:
${common}    ports: ["127.0.0.1:${port}:3000"]
    command: sh -c 'npm run db:migrate && npm run db:seed && npm run start'
  worker:
${common}    command: npm run worker
networks:
  infrastructure:
    external: true
    name: ${JSON.stringify(network)}
`,
    { mode: 0o600 },
  );
  containersCreated = true;
  compose(["up", "-d", "--no-build", "redis_check", "app"]);
  await ready();
  assert.equal((await fetch(`${origin}/api/workspace`)).status, 401);
  await request("auth", { email: "check1@themove.local", password });
  const initial = await request("workspace");
  assert.equal(initial.demo, false);
  assert.equal(initial.accountMetrics.length, 0);
  assert.equal(initial.posts.length, 0);
  assert.equal(initial.operators.length, 2);
  const title = `Docker persistence check ${suffix}`;
  const created = await request("projects", {
    action: "create",
    title,
    channelId: initial.channels[0].id,
    operatorId: initial.operators[0].id,
    format: "CAROUSEL",
    sourceUrls: ["https://example.com/docker-test-fixture"],
    draftCopy:
      "Explicit test fixture; no source or publishing verification claimed.",
  });
  const project = created.projects.find((p) => p.title === title);
  assert(project);
  await request("assets", {
    action: "add",
    projectId: project.id,
    kind: "IMAGE",
    url: "https://example.com/docker-test.jpg",
    credit: "Explicit fixture, not a fetched asset.",
  });
  compose(["restart", "app"]);
  await ready();
  const persisted = await request("workspace");
  assert(persisted.projects.some((p) => p.id === project.id));
  assert(persisted.assets.some((a) => a.projectId === project.id));
  assert(persisted.audit.some((a) => a.action === "asset.add"));
  console.log(
    "Docker app verified: protected login, two operators, honest empty metrics, project/asset/audit persistence after restart.",
  );
  compose(["up", "-d", "--no-build", "worker"]);
  for (const kind of ["TOPIC_DEDUP", "WEEKLY_REPORT"]) {
    const queued = await request("jobs", { kind });
    const task = queued.tasks.find((t) => t.kind === kind);
    assert(task);
    const deadline = Date.now() + 90000;
    let done = false;
    while (Date.now() < deadline) {
      const data = await request("workspace");
      const observed = data.tasks.find((t) => t.id === task.id);
      assert.notEqual(observed?.status, "FAILED", `${kind} worker failed.`);
      if (observed?.status === "SUCCEEDED") {
        for (const status of ["QUEUED", "RUNNING", "SUCCEEDED"])
          assert(
            data.events.some(
              (e) => e.taskId === task.id && e.status === status,
            ),
          );
        assert(observed.result, "Job result missing.");
        done = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(done, `${kind} timed out.`);
    console.log(
      `Docker worker verified: ${kind}, genuine lifecycle and result.`,
    );
  }
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Docker verification failed; inspect infrastructure and image setup. Credentials were not printed.",
  );
  process.exitCode = 1;
} finally {
  if (containersCreated) {
    try {
      compose(["down", "--volumes", "--remove-orphans"]);
    } catch {
      console.error("Disposable container cleanup needs attention.");
      process.exitCode = 1;
    }
  }
  if (databaseCreated) {
    try {
      await client.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } catch {
      console.error(
        `Disposable database cleanup needs attention: ${databaseName}`,
      );
      process.exitCode = 1;
    }
  }
  await client.end().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
