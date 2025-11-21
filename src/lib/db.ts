import { IdbFs, PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { drizzle } from "drizzle-orm/pglite"
import { sql } from "drizzle-orm"

const DB_NAME = "local-rag"
const SCHEMA_VERSION = 1
const VECTOR_DIMENSIONS = 768

let clientPromise: Promise<PGlite> | null = null
let readyPromise: Promise<void> | null = null
let dbPromise: ReturnType<typeof getDb> | null = null

export function getClient() {
	if (!clientPromise) {
		clientPromise = (async () => {
			const pg = new PGlite({
				fs: new IdbFs(DB_NAME),
				extensions: { vector },
				relaxedDurability: true,
			})
			return pg
		})()
	}

	return clientPromise
}

export async function getDb() {
	if (!dbPromise) {
		dbPromise = (async () => drizzle(await getClient()))()
	}

	return dbPromise
}

async function runBootstrap(pg: PGlite) {
	await pg.query("create extension if not exists vector;")
	await pg.query(`
		create table if not exists meta (
			key text primary key,
			value text not null
		);
	`)
	const createStatements = sql`
		create table if not exists documents (
			id text primary key,
			filename text not null,
			mime text not null,
			size integer not null,
			created_at timestamptz default now() not null,
			updated_at timestamptz default now() not null
		);
		create table if not exists doc_chunks (
			doc_id text not null references documents(id) on delete cascade,
			chunk_no integer not null,
			data bytea not null,
			primary key (doc_id, chunk_no)
		);
		create table if not exists doc_text (
			doc_id text not null references documents(id) on delete cascade,
			page integer not null default 0,
			content text not null,
			primary key (doc_id, page)
		);
		create table if not exists embeddings (
			doc_id text not null references documents(id) on delete cascade,
			page integer not null default 0,
			chunk integer not null default 0,
			embedding vector(${VECTOR_DIMENSIONS}) not null,
			metadata jsonb,
			primary key (doc_id, page, chunk)
		);
	`
	await pg.query(createStatements.sql)
	await pg.query(
		`
		insert into meta(key, value)
		values ('schema_version', $1)
		on conflict (key) do update set value = excluded.value;
	`,
		[SCHEMA_VERSION.toString()],
	)
}

export function ensureDbReady() {
	if (!readyPromise) {
		readyPromise = (async () => {
			const pg = await getClient()
			await runBootstrap(pg)
		})()
	}

	return readyPromise
}

export function resetDbCacheForDev() {
	clientPromise = null
	readyPromise = null
}
