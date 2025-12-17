import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";
import {
  MODEL_ID,
  LOCAL_READY_KEY,
  warmupReranker,
  hasCachedRerankerWeights,
  isRerankerModelReadyFlag,
  clearRerankerCache,
} from "@/lib/models/rerankerModel";

// Configure local environment for transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export function RerankerDownload() {
  return (
    <TransformersJSDownloadCard
      title="mxbai-rerank-xsmall-v1"
      modelId={MODEL_ID}
      descriptionPrefix="Download"
      descriptionSuffix="for reranking search results directly in your browser."
      links={[
        {
          href: "https://huggingface.co/mixedbread-ai/mxbai-rerank-xsmall-v1",
          label: "View on Hugging Face",
        },
      ]}
      clearCacheDescription="This will remove the model files from your browser cache. You will need to download them again to use the model."
      onDownload={async ({ onProgress }) => {
        await warmupReranker((p: any) => {
          if (p?.status === "progress") {
            const fraction = p.progress > 1 ? p.progress / 100 : p.progress;
            onProgress(Math.min(1, fraction));
          }
        });
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LOCAL_READY_KEY, "true");
        }
      }}
      clearCache={clearRerankerCache}
      hasCached={hasCachedRerankerWeights}
      isReadyFlag={isRerankerModelReadyFlag}
      getAvailability={async () => {
        if (isRerankerModelReadyFlag()) return "available";
        if (await hasCachedRerankerWeights()) return "downloadable";
        return "downloadable";
      }}
    />
  );
}
