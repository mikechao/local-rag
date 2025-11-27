import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { lo } from "@electric-sql/pglite/contrib/lo"
import { OpfsAhpFS } from "@electric-sql/pglite/opfs-ahp"
import { drizzle } from "drizzle-orm/pglite"
import { eq, sql } from "drizzle-orm"
import { documents } from "../db/schema"

let db: ReturnType<typeof drizzle> | null = null

async function getDb() {
	if (!db) {
		const wasmUrl = "/pglite.wasm"
		const wasmResponse = await fetch(wasmUrl)
		const wasmBuffer = await wasmResponse.arrayBuffer()
		const wasmModule = await WebAssembly.compile(wasmBuffer)

		const client = new PGlite({
			fs: new OpfsAhpFS("local-rag"),
			extensions: { vector, lo },
			relaxedDurability: true,
			wasmModule,
		})
		await client.waitReady
		db = drizzle(client)
	}
	return db
}

self.onmessage = async (e) => {
	const { type, docId, id } = e.data

	if (type === "GET_BLOB") {
		try {
			const db = await getDb()

			const doc = await db
				.select()
				.from(documents)
				.where(eq(documents.id, docId))
				.limit(1)

			const docRow = doc[0]

			if (!docRow) {
				throw new Error("Document not found")
			}

			// We can fetch all chunks here because we are in a worker
			// and won't block the UI thread.
			const loResult = await db.execute<{ data: Uint8Array }>(
				sql`select lo_get(${docRow.blobOid}) as data`,
			)
			const loRow = loResult.rows[0]
			if (!loRow) {
				throw new Error("Document data missing")
			}

			const blob = new Blob([loRow.data as unknown as BlobPart], {
				type: docRow.mime,
			})

			self.postMessage({
				type: "BLOB_RESULT",
				id,
				payload: { blob, filename: docRow.filename, mime: docRow.mime },
			})
		} catch (err) {
			self.postMessage({
				type: "BLOB_ERROR",
				id,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}
}
