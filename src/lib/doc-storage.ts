import { asc, eq } from "drizzle-orm"
import { docChunks, documents, docText } from "@/db/schema"
import { ensureDbReady, getDb } from "@/lib/db"

const FALLBACK_CHUNK_MB = 1

export const CHUNK_BYTES =
	Number(import.meta.env.VITE_CHUNK_MB ?? FALLBACK_CHUNK_MB) * 1024 * 1024

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

function chunkBuffer(bytes: Uint8Array, chunkSize = CHUNK_BYTES): Uint8Array[] {
	const chunks: Uint8Array[] = []
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.length)))
	}
	return chunks
}

export async function saveDocument(params: {
	file: File
	pageTexts?: string[]
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
	const pageTexts = params.pageTexts ?? []
	const total = fileBytes.length
	let written = 0

	await db.transaction(async (tx) => {
		await tx.insert(documents).values({
			id,
			filename: params.file.name,
			mime: params.file.type || "application/octet-stream",
			size: params.file.size,
			createdAt: now,
			updatedAt: now,
		})

		const chunks = chunkBuffer(fileBytes)
		for (let i = 0; i < chunks.length; i += 1) {
			if (params.signal?.aborted) {
				throw new DOMException("Upload aborted", "AbortError")
			}
			await tx.insert(docChunks).values({
				docId: id,
				chunkNo: i,
				data: chunks[i],
			})
			written += chunks[i].length
			params.onChunkProgress?.(written, total)
		}

		if (pageTexts.length > 0) {
			for (let page = 0; page < pageTexts.length; page += 1) {
				await tx.insert(docText).values({
					docId: id,
					page,
					content: pageTexts[page],
				})
			}
		}
	})

	return { id }
}

export async function getDocumentBlob(docId: string) {
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

	const chunks = await db
		.select({
			data: docChunks.data,
		})
		.from(docChunks)
		.where(eq(docChunks.docId, docId))
		.orderBy(asc(docChunks.chunkNo))

	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.data.length, 0)
	const combined = new Uint8Array(totalLength)
	let offset = 0
	for (const chunk of chunks) {
		combined.set(chunk.data, offset)
		offset += chunk.data.length
	}

	const blob = new Blob([combined], { type: docRow.mime })
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
