import {
	LOCAL_READY_KEY,
	clearSmolLM3Cache,
	ensureSmolLM3ModelReady,
	hasCachedSmolLM3Weights,
	isSmolLM3ModelReadyFlag,
	MODEL_ID,
	getSmolLM3Model,
} from "@/lib/models/smolLM3Model";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";

export function SmolLM3Download() {
	return (
		<TransformersJSDownloadCard
			title="SmolLM3 3B"
			modelId={MODEL_ID}
			descriptionPrefix="Download"
			descriptionSuffix=' a reasoning model, where you can see the model "thinking" steps in detail.'
			links={[
				{
					href: "https://huggingface.co/HuggingFaceTB/SmolLM3-3B-ONNX",
					label: "View on Hugging Face",
				},
			]}
			clearCacheDescription="Clearing the cache will require re-downloading the model for chat."
			onDownload={async ({ onProgress }) => {
				await ensureSmolLM3ModelReady({
					onProgress: ({ progress }) => onProgress(progress),
				});
				if (typeof localStorage !== "undefined") {
					localStorage.setItem(LOCAL_READY_KEY, "true");
				}
			}}
			clearCache={clearSmolLM3Cache}
			hasCached={hasCachedSmolLM3Weights}
			isReadyFlag={isSmolLM3ModelReadyFlag}
			getAvailability={async () => {
				const model = getSmolLM3Model();
				return model.availability();
			}}
		/>
	);
}
