import { type PretrainedModelOptions } from "@huggingface/transformers";

export interface TransformersJSSpeechSettings
  extends Pick<PretrainedModelOptions, "device" | "dtype"> {
  /**
   * Progress callback for model initialization
   */
  initProgressCallback?: (progress: { progress: number }) => void;
  /**
   * Optional Web Worker to run the model off the main thread
   */
  worker?: Worker;
  /**
   * Default speaker embeddings (voice).
   */
  speaker_embeddings?: string | Float32Array | Record<string, any>;
  /**
   * Default speaker ID (for multi-speaker models).
   */
  speaker_id?: number;
  /**
   * Boolean to use quantized models (default: true).
   */
  quantized?: boolean;
  /**
   * Model revision (default: 'main').
   */
  revision?: string;
  /**
   * Custom cache directory (Node.js only).
   */
  cache_dir?: string;
  /**
   * Boolean to force using local files.
   */
  local_files_only?: boolean;
}
