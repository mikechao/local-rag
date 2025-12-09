import {
	LOCAL_READY_KEY,
	clearMistralCache,
	ensureMistralModelReady,
	hasCachedMistralWeights,
	isMistralModelReadyFlag,
	MODEL_ID,
	getMistralModel,
} from "@/lib/models/mistralModel";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";

export function MistralDownload() {
	return (
		<TransformersJSDownloadCard
			title="Ministral 3 3B Instruct"
			modelId={MODEL_ID}
			descriptionPrefix="Download"
			descriptionSuffix=' a reasoning model, where you can see the model "thinking" steps in detail.'
			links={[
				{
					href: "https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-ONNX",
					label: "View on Hugging Face",
				},
			]}
			clearCacheDescription="Clearing the cache will require re-downloading the model for chat."
			onDownload={async ({ onProgress }) => {
				await ensureMistralModelReady({
					onProgress: ({ progress }) => onProgress(progress),
				});
				if (typeof localStorage !== "undefined") {
					localStorage.setItem(LOCAL_READY_KEY, "true");
				}
			}}
			clearCache={clearMistralCache}
			hasCached={hasCachedMistralWeights}
			isReadyFlag={isMistralModelReadyFlag}
			getAvailability={async () => {
				const model = getMistralModel();
				return model.availability();
			}}
		/>
	);
}
