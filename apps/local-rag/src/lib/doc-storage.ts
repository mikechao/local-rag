import { documents, docText } from "@/db/schema"
import { ensureDbReady, getDb } from "@/lib/db"
import { sql } from "drizzle-orm"

const FALLBACK_CHUNK_MB = 1

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

	await db.transaction(async (tx) => {
		const loResult = await tx.execute<{ oid: number }>(
			sql`select lo_from_bytea(0, ${fileBytes}) as oid`,
		)
		const blobOid = loResult.rows[0]?.oid
		if (blobOid == null) {
			throw new Error("Failed to store document bytes")
		}

		await tx.insert(documents).values({
			id,
			filename: params.file.name,
			mime: params.file.type || "application/octet-stream",
			size: params.file.size,
			blobOid,
			createdAt: now,
			updatedAt: now,
		})

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

	params.onChunkProgress?.(total, total)

	return { id }
}

let blobWorker: Worker | null = null

function getBlobWorker() {
	if (!blobWorker) {
		blobWorker = new Worker(new URL("../workers/blob.worker.ts", import.meta.url), {
			type: "module",
		})
	}
	return blobWorker
}

export async function getDocumentBlob(
	docId: string,
): Promise<{ blob: Blob; filename: string; mime: string }> {
	const worker = getBlobWorker()
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID()
		const handler = (e: MessageEvent) => {
			if (e.data.id === id) {
				worker.removeEventListener("message", handler)
				if (e.data.type === "BLOB_ERROR") {
					reject(new Error(e.data.error))
				} else if (e.data.type === "BLOB_RESULT") {
					resolve(e.data.payload)
				}
			}
		}
		worker.addEventListener("message", handler)
		worker.postMessage({ type: "GET_BLOB", docId, id })
	})
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
