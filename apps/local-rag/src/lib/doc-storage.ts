import { documents, documentChunks, chunkEmbeddings } from "@/db/schema"
import { ensureDbReady, getDb } from "@/lib/db"
import { eq, sql, and } from "drizzle-orm"
import { MODEL_ID } from "@/lib/models/embeddingModel"

export type QuotaEstimate = {
	usage?: number
	quota?: number
	ok: boolean
}

export class QuotaExceededError extends Error {
	constructor(message: string, public estimate: QuotaEstimate) {
		super(message)
		this.name = "QuotaExceededError"
	}
}

const FALLBACK_CHUNK_MB = 1
export const CHUNK_BYTES =
	Number(import.meta.env.VITE_CHUNK_MB ?? FALLBACK_CHUNK_MB) * 1024 * 1024

export async function checkStorageQuota(requiredBytes: number): Promise<QuotaEstimate> {
	if (!("storage" in navigator) || typeof navigator.storage.estimate !== "function") {
		return { ok: true }
	}

	const estimate = await navigator.storage.estimate()
	const remaining = (estimate.quota ?? 0) - (estimate.usage ?? 0)
	return {
		usage: estimate.usage,
		quota: estimate.quota,
		ok: remaining >= requiredBytes * 1.2,
	}
}

function* chunkBuffer(bytes: Uint8Array, chunkSize = CHUNK_BYTES) {
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		yield bytes.slice(offset, Math.min(offset + chunkSize, bytes.length))
	}
}

export async function saveDocument(params: {
	file: File
	clock?: () => Date
	signal?: AbortSignal
	onChunkProgress?: (written: number, total: number) => void
}) {
	const quota = await checkStorageQuota(params.file.size)
	if (!quota.ok) {
		throw new QuotaExceededError("Not enough storage space available", quota)
	}

	if (params.signal?.aborted) {
		throw new DOMException("Upload aborted", "AbortError")
	}

	await ensureDbReady()
	const db = await getDb()
	const fileBytes = new Uint8Array(await params.file.arrayBuffer())

	const id = crypto.randomUUID()
	const now = params.clock ? params.clock() : new Date()
	const total = fileBytes.length

	await db.transaction(async (tx) => {
		const createRes = await tx.execute<{ oid: number }>(sql`select lo_create(0) as oid`)
		const blobOid = createRes.rows[0]?.oid
		if (blobOid == null) {
			throw new Error("Failed to allocate large object")
		}

		const fdRes = await tx.execute<{ fd: number }>(sql`select lo_open(${blobOid}, 131072) as fd`)
		const fd = fdRes.rows[0]?.fd
		if (fd == null) {
			throw new Error("Failed to open large object")
		}

		let written = 0
		for (const chunk of chunkBuffer(fileBytes)) {
			if (params.signal?.aborted) {
				throw new DOMException("Upload aborted", "AbortError")
			}
			await tx.execute(sql`select lowrite(${fd}, ${chunk})`)
			written += chunk.length
			params.onChunkProgress?.(written, total)
		}

		await tx.execute(sql`select lo_close(${fd})`)

		await tx.insert(documents).values({
			id,
			filename: params.file.name,
			mime: params.file.type || "application/octet-stream",
			size: params.file.size,
			blobOid,
			createdAt: now,
			updatedAt: now,
		})
	})

	params.onChunkProgress?.(total, total)

	return { id }
}

export async function saveChunks(
	docId: string,
	docType: string,
	chunks: {
		pageNumber: number;
		chunkIndex: number;
		text: string;
		headingPath?: string;
	}[]
) {
	await ensureDbReady()
	const db = await getDb()

	await db.transaction(async (tx) => {
		// Delete existing chunks for this doc
		await tx.delete(documentChunks).where(eq(documentChunks.docId, docId))

		// Insert new chunks
		if (chunks.length > 0) {
			const values = chunks.map((chunk) => ({
				id: `${docId}-${chunk.pageNumber}-${chunk.chunkIndex}`,
				docId,
				docType,
				pageNumber: chunk.pageNumber,
				chunkIndex: chunk.chunkIndex,
				headingPath: chunk.headingPath,
				text: chunk.text,
				embedded: false,
			}))

			await tx.insert(documentChunks).values(values)
		}
	})
}

export async function getDocumentBlob(
	docId: string,
): Promise<{ blob: Blob; filename: string; mime: string }> {
	await ensureDbReady()
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

	return { blob, filename: docRow.filename, mime: docRow.mime }
}

export async function getDocumentObjectUrl(docId: string) {
	const result = await getDocumentBlob(docId)
	const url = URL.createObjectURL(result.blob)
	return {
		...result,
		url,
		revoke: () => URL.revokeObjectURL(url),
	}
}

export type PdfStreamMeta = {
	blobOid: number
	mime: string
	filename: string
	size: number
}

export async function initPdfStream(docId: string): Promise<PdfStreamMeta> {
	await ensureDbReady()
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

	return {
		blobOid: docRow.blobOid,
		mime: docRow.mime,
		filename: docRow.filename,
		size: docRow.size,
	}
}

export async function fetchPdfRange(
	docId: string,
	start: number,
	end: number,
): Promise<{ begin: number | undefined; data: Uint8Array }> {
	await ensureDbReady()
	const db = await getDb()
	const doc = await db
		.select({ oid: documents.blobOid })
		.from(documents)
		.where(eq(documents.id, docId))
		.limit(1)

	const row = doc[0]
	if (!row) {
		throw new Error("Document not found")
	}
	const len = Math.max(0, end - start)
	const loResult = await db.execute<{ data: Uint8Array }>(
		sql`select lo_get(${row.oid}, ${start}, ${len}) as data`,
	)
	const loRow = loResult.rows[0]
	if (!loRow) {
		throw new Error("Range read failed")
	}
	return { begin: start, data: loRow.data }
}

export async function getUnembeddedChunks(docId: string, limit = 64) {
	await ensureDbReady()
	const db = await getDb()
	return db
		.select({
			id: documentChunks.id,
			text: documentChunks.text,
		})
		.from(documentChunks)
		.where(
			and(
				eq(documentChunks.docId, docId),
				eq(documentChunks.embedded, false),
			),
		)
		.limit(limit)
}

export async function saveChunkEmbeddings(
	embeddings: { chunkId: string; embedding: number[] }[],
) {
	await ensureDbReady()
	const db = await getDb()

	await db.transaction(async (tx) => {
		for (const { chunkId, embedding } of embeddings) {
			await tx.insert(chunkEmbeddings).values({
				chunkId,
				embedding,
				embeddingModel: MODEL_ID,
			})
			await tx
				.update(documentChunks)
				.set({ embedded: true })
				.where(eq(documentChunks.id, chunkId))
		}
	})
}
