import type { PGlite } from "@electric-sql/pglite";

// Vite will inline SQL migration files at build time.
const migrationImports = import.meta.glob("../../drizzle/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) satisfies Record<string, string>;

type Migration = {
  id: string;
  sql: string;
};

function getMigrations(): Migration[] {
  return Object.entries(migrationImports)
    .map(([path, sql]) => ({
      id: path.split("/").pop() ?? path,
      sql,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function ensureMigrationsTable(pg: PGlite) {
  await pg.query(`
		create table if not exists "__drizzle_migrations__" (
			id text primary key,
			applied_at timestamptz default now() not null
		);
	`);
}

/**
 * Setup PostgreSQL extensions that can't be managed through Drizzle schema.
 * These are idempotent (safe to run multiple times).
 */
async function setupExtensions(pg: PGlite) {
  // Enable pg_trgm for trigram-based text search (hybrid search)
  await pg.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  // Create GIN index for fast trigram searches on document_chunks.text
  // This index is used by the hybrid search to find keyword matches efficiently
  await pg.query(`
		CREATE INDEX IF NOT EXISTS document_chunks_text_trgm_idx 
		ON document_chunks USING GIN (text gin_trgm_ops);
	`);
}

async function isApplied(pg: PGlite, id: string) {
  const result = await pg.query<{ id: string }>(
    `select id from "__drizzle_migrations__" where id = $1 limit 1`,
    [id],
  );
  return result.rows.length > 0;
}

async function markApplied(pg: PGlite, id: string) {
  await pg.query(
    `insert into "__drizzle_migrations__"(id) values ($1) on conflict (id) do nothing`,
    [id],
  );
}

function splitStatements(sql: string) {
  return sql
    .split(/-->\s*statement-breakpoint\s*/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function applyMigrations(pg: PGlite) {
  await ensureMigrationsTable(pg);
  const migrations = getMigrations();

  for (const migration of migrations) {
    // eslint-disable-next-line no-await-in-loop
    const already = await isApplied(pg, migration.id);
    if (already) continue;

    const statements = splitStatements(migration.sql);

    // Apply in a transaction so a failing statement doesn't half-apply.
    // eslint-disable-next-line no-await-in-loop
    await pg.query("begin;");
    try {
      // eslint-disable-next-line no-await-in-loop
      for (const stmt of statements) {
        // eslint-disable-next-line no-await-in-loop
        await pg.query(stmt);
      }
      // eslint-disable-next-line no-await-in-loop
      await markApplied(pg, migration.id);
      // eslint-disable-next-line no-await-in-loop
      await pg.query("commit;");
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await pg.query("rollback;");
      throw error;
    }
  }

  // Setup extensions after migrations (idempotent, safe to run every time)
  await setupExtensions(pg);
}
