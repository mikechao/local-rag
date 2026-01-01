import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { cleanClearCahce } from "./utils";

export const MODEL_ID = "mixedbread-ai/mxbai-rerank-xsmall-v1";
export const LOCAL_READY_KEY = "mxbai-rerank-xsmall-v1-ready";

// Configure local environment
env.allowLocalModels = false;
env.useBrowserCache = true;

type ProgressCallback = (info: unknown) => void;

type RerankResult = {
  corpus_id: number;
  score: number;
  text?: string;
};

type RerankOptions = {
  top_k?: number;
  return_documents?: boolean;
};

let modelPromise: Promise<PreTrainedModel> | null = null;
let tokenizerPromise: Promise<PreTrainedTokenizer> | null = null;

export async function loadRerankerModel(progressCallback?: ProgressCallback) {
  if (!modelPromise) {
    modelPromise = AutoModelForSequenceClassification.from_pretrained(
      MODEL_ID,
      {
        device: "webgpu",
        progress_callback: progressCallback,
      },
    );
  }
  return modelPromise;
}

export async function loadRerankerTokenizer(
  progressCallback?: ProgressCallback,
) {
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback,
    });
  }
  return tokenizerPromise;
}

export async function warmupReranker(progressCallback?: ProgressCallback) {
  const [model, tokenizer] = await Promise.all([
    loadRerankerModel(progressCallback),
    loadRerankerTokenizer(progressCallback),
  ]);

  // Warm up to compile shaders / initialize kernels.
  const inputs = tokenizer(["Hello"], {
    text_pair: ["Hello"],
    padding: true,
    truncation: true,
  });
  // output is https://huggingface.co/docs/transformers.js/en/api/models#module_models.SequenceClassifierOutput
  const output = await (model as any)(inputs);
  const logits = output.logits;
  void logits.data; // e.g. touch the data / force a real read:
  logits.sigmoid().tolist();
}

/**
 * Rank documents using the CrossEncoder. Returns a sorted list with corpus_id and score.
 */
export async function rerank(
  query: string,
  documents: string[],
  { top_k = undefined, return_documents = false }: RerankOptions = {},
  progressCallback?: ProgressCallback,
): Promise<RerankResult[]> {
  const [model, tokenizer] = await Promise.all([
    loadRerankerModel(progressCallback),
    loadRerankerTokenizer(progressCallback),
  ]);

  const inputs = (tokenizer as any)(new Array(documents.length).fill(query), {
    text_pair: documents,
    padding: true,
    truncation: true,
  });

  const { logits } = await (model as any)(inputs);
  return (logits as any)
    .sigmoid()
    .tolist()
    .map(([score]: [number], i: number) => ({
      corpus_id: i,
      score,
      ...(return_documents ? { text: documents[i] } : {}),
    }))
    .sort((a: RerankResult, b: RerankResult) => b.score - a.score)
    .slice(0, top_k);
}

export async function hasCachedRerankerWeights(): Promise<boolean> {
  if (typeof window === "undefined" || typeof caches === "undefined")
    return false;
  const keys = await caches.keys();
  for (const key of keys) {
    if (!key.includes("transformers")) continue;
    const cache = await caches.open(key);
    const requests = await cache.keys();
    if (requests.some((req) => req.url.includes(MODEL_ID))) return true;
  }
  return false;
}

export function isRerankerModelReadyFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return false;
  return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

export async function clearRerankerCache() {
  await cleanClearCahce(MODEL_ID, LOCAL_READY_KEY);
  modelPromise = null;
  tokenizerPromise = null;
}
