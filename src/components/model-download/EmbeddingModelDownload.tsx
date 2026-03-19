import { getModelDescriptor } from "@/lib/models/model-registry";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";

// all-MiniLM-L6-v2 is a popular sentence-transformers model optimized for semantic similarity
export function EmbeddingModelDownload() {
  const model = getModelDescriptor("embedding");
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
