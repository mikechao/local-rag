import { IdbFs, PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { drizzle } from "drizzle-orm/pglite"
import { applyMigrations } from "@/lib/migrations"

const DB_NAME = "local-rag"
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
	// Ensure pgvector exists before applying migrations that rely on it.
	await pg.query("create extension if not exists vector;")
	await applyMigrations(pg)
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
