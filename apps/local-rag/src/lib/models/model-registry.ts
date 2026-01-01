import type { TransformersJSTranscriptionModel } from "@built-in-ai/transformers-js";
import {
  clearEmbeddingCacheWorker,
  warmupEmbeddingModel,
} from "../embedding-worker";
import {
  LOCAL_READY_KEY as EMBEDDING_READY_KEY,
  MODEL_ID as EMBEDDING_MODEL_ID,
  getModel as getEmbeddingModel,
  hasCachedWeights as hasCachedEmbeddingWeights,
  isModelReadyFlag as isEmbeddingModelReadyFlag,
} from "./embeddingModel";
import {
  LOCAL_READY_KEY as RERANKER_READY_KEY,
  MODEL_ID as RERANKER_MODEL_ID,
  clearRerankerCache,
  hasCachedRerankerWeights,
  isRerankerModelReadyFlag,
  warmupReranker,
} from "./rerankerModel";
import {
  LOCAL_READY_KEY as SPEECH_READY_KEY,
  MODEL_ID as SPEECH_MODEL_ID,
  clearSpeechCache,
  hasCachedSpeechWeights,
  isSpeechModelReadyFlag,
  loadSpeechPipeline,
} from "./speechModel";
import {
  LOCAL_READY_KEY as WHISPER_READY_KEY,
  MODEL_ID as WHISPER_MODEL_ID,
  clearWhisperCache,
  getWhisperModel,
  hasCachedWhisperWeights,
  isWhisperModelReadyFlag,
} from "./whisperModel";

/**
 * Logical keys used to reference supported local models.
 */
export type ModelKey = "embedding" | "reranker" | "speech" | "whisper";

/**
 * External link metadata for model cards.
 */
export type ModelLink = {
  href: string;
  label: string;
};

/**
 * Model registry entry describing how to warm up, check availability, and clear cache.
 */
export type ModelDescriptor = {
  key: ModelKey;
  title: string;
  modelId: string;
  readyKey: string;
  descriptionPrefix: string;
  descriptionSuffix: string;
  clearCacheDescription: string;
  links: ModelLink[];
  warmup: (opts?: { onProgress?: (progress: number) => void }) => Promise<void>;
  clearCache: () => Promise<void>;
  hasCached: () => Promise<boolean>;
  isReady: () => boolean;
  getAvailability: () => Promise<"unavailable" | "downloadable" | "available">;
  markReady: () => void;
};

/**
 * Clamp and normalize progress values into a 0-1 fraction.
 */
function normalizeProgress(progress: number): number {
  const fraction = progress > 1 ? progress / 100 : progress;
  if (Number.isNaN(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * Persist a "ready" flag in local storage for client-only model gating.
 */
function markReadyFlag(key: string) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, "true");
  }
}

/**
 * Simple availability helper for models that are always downloadable.
 */
async function availabilityFromCacheOrFlag(
  isReady: () => boolean,
  hasCached: () => Promise<boolean>,
): Promise<"available" | "downloadable"> {
  if (isReady()) return "available";
  if (await hasCached()) return "downloadable";
  return "downloadable";
}

/**
 * Registry of supported local models and their behaviors.
 */
const MODEL_REGISTRY: Record<ModelKey, ModelDescriptor> = {
  embedding: {
    key: "embedding",
    title: "all-MiniLM-L6-v2",
    modelId: EMBEDDING_MODEL_ID,
    readyKey: EMBEDDING_READY_KEY,
    descriptionPrefix: "Download",
    descriptionSuffix:
      "for offline embeddings. Cached locally after first download.",
    clearCacheDescription:
      "Clearing the cache will disable adding new documents.",
    links: [
      {
        href: "https://huggingface.co/Xenova/all-MiniLM-L6-v2",
        label: "View on Hugging Face",
      },
      {
        href: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
        label: "Original Model",
      },
    ],
    warmup: async ({ onProgress } = {}) => {
      await warmupEmbeddingModel({
        onProgress: (progress) => {
          onProgress?.(normalizeProgress(progress));
        },
      });
    },
    clearCache: clearEmbeddingCacheWorker,
    hasCached: hasCachedEmbeddingWeights,
    isReady: isEmbeddingModelReadyFlag,
    getAvailability: async () => {
      const model = getEmbeddingModel();
      return model.availability();
    },
    markReady: () => markReadyFlag(EMBEDDING_READY_KEY),
  },
  reranker: {
    key: "reranker",
    title: "mxbai-rerank-xsmall-v1",
    modelId: RERANKER_MODEL_ID,
    readyKey: RERANKER_READY_KEY,
    descriptionPrefix: "Download",
    descriptionSuffix: "for reranking search results directly in your browser.",
    clearCacheDescription:
      "This will remove the model files from your browser cache. You will need to download them again to use the model.",
    links: [
      {
        href: "https://huggingface.co/mixedbread-ai/mxbai-rerank-xsmall-v1",
        label: "View on Hugging Face",
      },
    ],
    warmup: async ({ onProgress } = {}) => {
      await warmupReranker((info: any) => {
        if (info?.status === "progress") {
          onProgress?.(normalizeProgress(info.progress));
        }
      });
    },
    clearCache: clearRerankerCache,
    hasCached: hasCachedRerankerWeights,
    isReady: isRerankerModelReadyFlag,
    getAvailability: async () =>
      availabilityFromCacheOrFlag(
        isRerankerModelReadyFlag,
        hasCachedRerankerWeights,
      ),
    markReady: () => markReadyFlag(RERANKER_READY_KEY),
  },
  speech: {
    key: "speech",
    title: "Supertonic TTS",
    modelId: SPEECH_MODEL_ID,
    readyKey: SPEECH_READY_KEY,
    descriptionPrefix: "Download",
    descriptionSuffix:
      "for text-to-speech generation directly in your browser.",
    clearCacheDescription:
      "This will remove the model files from your browser cache. You will need to download them again to use the model.",
    links: [
      {
        href: "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX",
        label: "View on Hugging Face",
      },
    ],
    warmup: async ({ onProgress } = {}) => {
      await loadSpeechPipeline((info: any) => {
        if (info?.status === "progress") {
          onProgress?.(normalizeProgress(info.progress));
        }
      });
    },
    clearCache: clearSpeechCache,
    hasCached: hasCachedSpeechWeights,
    isReady: isSpeechModelReadyFlag,
    getAvailability: async () =>
      availabilityFromCacheOrFlag(
        isSpeechModelReadyFlag,
        hasCachedSpeechWeights,
      ),
    markReady: () => markReadyFlag(SPEECH_READY_KEY),
  },
  whisper: {
    key: "whisper",
    title: "Whisper Base",
    modelId: WHISPER_MODEL_ID,
    readyKey: WHISPER_READY_KEY,
    descriptionPrefix: "Download",
    descriptionSuffix:
      "for automatic speech recognition (ASR) directly in your browser.",
    clearCacheDescription:
      "This will remove the model files from your browser cache. You will need to download them again to use the model.",
    links: [
      {
        href: "https://huggingface.co/Xenova/whisper-base",
        label: "View on Hugging Face",
      },
    ],
    warmup: async ({ onProgress } = {}) => {
      const model =
        getWhisperModel() as unknown as TransformersJSTranscriptionModel;
      await model.createSessionWithProgress((info) => {
        onProgress?.(normalizeProgress(info.progress));
      });
    },
    clearCache: clearWhisperCache,
    hasCached: hasCachedWhisperWeights,
    isReady: isWhisperModelReadyFlag,
    getAvailability: async () => {
      const model =
        getWhisperModel() as unknown as TransformersJSTranscriptionModel;
      return model.availability();
    },
    markReady: () => markReadyFlag(WHISPER_READY_KEY),
  },
};

/**
 * Read a model descriptor by key.
 */
export function getModelDescriptor(key: ModelKey): ModelDescriptor {
  return MODEL_REGISTRY[key];
}

/**
 * List all registered model descriptors in stable order.
 */
export function listModelDescriptors(): ModelDescriptor[] {
  return [
    MODEL_REGISTRY.embedding,
    MODEL_REGISTRY.reranker,
    MODEL_REGISTRY.speech,
    MODEL_REGISTRY.whisper,
  ];
}

/**
 * Check whether a model is ready or has cached weights available for use.
 */
export async function isModelAvailable(key: ModelKey): Promise<boolean> {
  const model = getModelDescriptor(key);
  if (model.isReady()) return true;
  return model.hasCached();
}
