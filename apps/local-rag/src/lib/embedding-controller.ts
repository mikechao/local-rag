import { getUnembeddedChunks, saveChunkEmbeddings } from "./doc-storage";
import { embedBatchWorker, warmupEmbeddingModel } from "./embedding-worker";

export async function embedDocument(
	docId: string,
	totalChunks: number,
	onProgress?: (progress: number) => void,
) {
	// Ensure model is ready
	await warmupEmbeddingModel();

	let processed = 0;

	while (true) {
		const chunks = await getUnembeddedChunks(docId, 32); // Batch size 32
		if (chunks.length === 0) break;

		const chunkTexts = chunks.map((c) => c.text);
		const batchId = crypto.randomUUID();

		const result = await embedBatchWorker(docId, chunkTexts, batchId);

		// Unpack buffer
		const floatArray = new Float32Array(result.buffer);
		const embeddings: { chunkId: string; embedding: number[] }[] = [];

		for (let i = 0; i < chunks.length; i++) {
			const start = i * result.dims;
			const end = start + result.dims;
			const embedding = Array.from(floatArray.slice(start, end));
			embeddings.push({ chunkId: chunks[i].id, embedding });
		}

		await saveChunkEmbeddings(embeddings);
		processed += chunks.length;
		
        if (totalChunks > 0) {
            onProgress?.(Math.min(100, Math.round((processed / totalChunks) * 100)));
        }
	}
}
