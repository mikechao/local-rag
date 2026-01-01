import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";
import { getModelDescriptor } from "@/lib/models/model-registry";

// Configure local environment for transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export function SpeechDownload() {
  const model = getModelDescriptor("speech");
  return (
    <TransformersJSDownloadCard
      title={model.title}
      modelId={model.modelId}
      descriptionPrefix={model.descriptionPrefix}
      descriptionSuffix={model.descriptionSuffix}
      links={model.links}
      clearCacheDescription={model.clearCacheDescription}
      onDownload={async ({ onProgress }) => {
        await model.warmup({ onProgress });
        model.markReady();
      }}
      clearCache={model.clearCache}
      hasCached={model.hasCached}
      isReadyFlag={model.isReady}
      getAvailability={model.getAvailability}
    />
  );
}
