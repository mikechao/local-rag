import {
	getModel,
	hasCachedWeights,
	isModelReadyFlag,
	LOCAL_READY_KEY,
	MODEL_ID,
} from "@/lib/models/embeddingModel";
import {
	clearEmbeddingCacheWorker,
	warmupEmbeddingModel,
} from "@/lib/embedding-worker";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";

// all-MiniLM-L6-v2 is a popular sentence-transformers model optimized for semantic similarity
export function EmbeddingModelDownload() {
	return (
		<TransformersJSDownloadCard
			title="all-MiniLM-L6-v2"
			modelId={MODEL_ID}
			descriptionPrefix="Download"
			descriptionSuffix="for offline embeddings. Cached locally after first download."
			links={[
				{
					href: "https://huggingface.co/Xenova/all-MiniLM-L6-v2",
					label: "View on Hugging Face",
				},
				{
					href: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
					label: "Original Model",
				},
			]}
			clearCacheDescription="Clearing the cache will disable adding new documents."
			onDownload={async ({ onProgress }) => {
				await warmupEmbeddingModel({
					onProgress: (progress) => onProgress(progress),
				});
				if (typeof localStorage !== "undefined") {
					localStorage.setItem(LOCAL_READY_KEY, "true");
				}
			}}
			clearCache={clearEmbeddingCacheWorker}
			hasCached={hasCachedWeights}
			isReadyFlag={isModelReadyFlag}
			getAvailability={async () => {
				const model = getModel();
				return model.availability();
			}}
		/>
	);
}
