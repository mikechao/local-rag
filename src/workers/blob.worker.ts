import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { IdbFs } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq, asc } from "drizzle-orm"
import { documents, docChunks } from "@/db/schema"

let db: ReturnType<typeof drizzle> | null = null

async function getDb() {
	if (!db) {
		const client = new PGlite({
			fs: new IdbFs("local-rag"),
			extensions: { vector },
			relaxedDurability: true,
		})
		// Wait for ready? PGlite constructor starts it.
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
			const chunks = await db
				.select({
					data: docChunks.data,
				})
				.from(docChunks)
				.where(eq(docChunks.docId, docId))
				.orderBy(asc(docChunks.chunkNo))

			const blob = new Blob(
				chunks.map((chunk) => chunk.data as unknown as BlobPart),
				{ type: docRow.mime },
			)

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
