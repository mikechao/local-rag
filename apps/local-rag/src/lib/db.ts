import { PGliteWorker } from "@electric-sql/pglite/worker"
import type { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { applyMigrations } from "@/lib/migrations"

let clientPromise: Promise<PGliteWorker> | null = null
let readyPromise: Promise<void> | null = null
let dbPromise: ReturnType<typeof buildDbPromise> | null = null

function buildDbPromise() {
	return (async () => drizzle((await getClient()) as unknown as PGlite))()
}

export function getClient() {
	if (!clientPromise) {
		clientPromise = (async () => {
			return new PGliteWorker(
				new Worker(new URL("../workers/db.worker.ts", import.meta.url), {
					type: "module",
				}),
			)
		})()
	}

	return clientPromise
}

export async function getDb() {
	if (!dbPromise) {
		dbPromise = buildDbPromise()
	}

	return dbPromise
}

async function runBootstrap(pg: PGliteWorker) {
	// Ensure pgvector exists before applying migrations that rely on it.
	await pg.query("create extension if not exists vector;")
	await applyMigrations(pg as unknown as PGlite)
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

export async function closeDb() {
	if (clientPromise) {
		const pg = await clientPromise
		await pg.close()
		clientPromise = null
		readyPromise = null
		dbPromise = null
	}
}
