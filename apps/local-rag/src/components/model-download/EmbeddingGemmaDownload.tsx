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

// Use ONNX-converted weights that include `onnx/model_quantized.onnx`
// to avoid missing-file errors from the original repository.
export function EmbeddingGemmaDownload() {
	return (
		<TransformersJSDownloadCard
			title="EmbeddingGemma"
			modelId={MODEL_ID}
			descriptionPrefix="Download"
			descriptionSuffix="for offline embeddings. Cached locally after first download."
			links={[
				{
					href: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX",
					label: "View on Hugging Face",
				},
				{
					href: "https://ai.google.dev/gemma/docs/embeddinggemma",
					label: "Google Model Card",
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
