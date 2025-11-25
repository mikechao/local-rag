import {
	LOCAL_READY_KEY,
	clearQwenCache,
	ensureQwenModelReady,
	hasCachedQwenWeights,
	isQwenModelReadyFlag,
	MODEL_ID,
	getQwenModel,
} from "@/lib/models/qwenModel";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";

export function QwenDownload() {
	return (
		<TransformersJSDownloadCard
			title="Qwen3-0.6B"
			modelId={MODEL_ID}
			descriptionPrefix="Download"
			descriptionSuffix="for local chat. Cached locally after first download."
			links={[
				{
					href: "https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX",
					label: "View on Hugging Face",
				},
			]}
			clearCacheDescription="Clearing the cache will require re-downloading the model for chat."
			onDownload={async ({ onProgress }) => {
				await ensureQwenModelReady({
					onProgress: ({ progress }) => onProgress(progress),
				});
				if (typeof localStorage !== "undefined") {
					localStorage.setItem(LOCAL_READY_KEY, "true");
				}
			}}
			clearCache={clearQwenCache}
			hasCached={hasCachedQwenWeights}
			isReadyFlag={isQwenModelReadyFlag}
			getAvailability={async () => {
				const model = getQwenModel();
				return model.availability();
			}}
		/>
	);
}
