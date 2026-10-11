import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

/** Applies Prisma-generated SQL atomically without downloading a native engine.
 * Prisma 6's JS migration engine cannot deserialize PostgreSQL's `name` catalog
 * type, so deployment uses pg and the standard Prisma migration ledger. */
export async function migrateDatabase(
  databaseUrl = process.env.DATABASE_URL,
  migrationDirectory = path.resolve("prisma/migrations"),
): Promise<string[]> {
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required to apply database migrations.");
  const files = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('the-move-os:migrations'))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const ledger = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
    );
    for (const entry of ledger.rows) {
      if (!files.includes(entry.migration_name))
        throw new Error(
          `Applied migration ${entry.migration_name} is missing locally. Restore its original file before continuing.`,
        );
      if (!entry.finished_at && !entry.rolled_back_at)
        throw new Error(
          `Migration ${entry.migration_name} is unfinished. Diagnose its failure before resolving its ledger entry.`,
        );
    }
    for (const name of files) {
      const sql = await readFile(
        path.join(migrationDirectory, name, "migration.sql"),
        "utf8",
      );
      if (!sql.trim()) throw new Error(`Migration ${name} is empty.`);
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = ledger.rows.find(
        (entry) =>
          entry.migration_name === name &&
          entry.finished_at &&
          !entry.rolled_back_at,
      );
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(
            `Migration ${name} changed after it was applied. Restore the original and create a new migration.`,
          );
        continue;
      }
      const id = randomUUID();
      await client.query(
        'INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ($1, $2, $3)',
        [id, checksum, name],
      );
      await client.query(sql);
      await client.query(
        'UPDATE "_prisma_migrations" SET finished_at = CURRENT_TIMESTAMP, applied_steps_count = 1 WHERE id = $1',
        [id],
      );
      applied.push(name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  migrateDatabase()
    .then((applied) =>
      console.log(
        applied.length
          ? `Applied ${applied.length} migration(s): ${applied.join(", ")}`
          : "Database migrations are current; checksums verified.",
      ),
    )
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Migration failed",
      );
      process.exitCode = 1;
    });
}
