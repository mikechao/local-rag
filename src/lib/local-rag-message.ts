import { UIMessage } from "ai";
import type { RetrievalResult } from "./retrieval";

export type RetrievalStatus =
  | { phase: "deciding"; message?: string }
  | { phase: "skipped"; message?: string }
  | { phase: "retrieving"; query?: string; message?: string }
  | { phase: "reranking"; query?: string; message?: string }
  | { phase: "done"; resultsCount: number; tookMs?: number; message?: string }
  | { phase: "error"; message: string };

export type ModelUsage = {
  inputUsage?: number;
  inputQuota?: number;
};

// UI message shape for the chat UI. Adds a data part for retrieval results.
export type LocalRAGMessage = UIMessage<
  never, // metadata
  {
    retrievalResults: RetrievalResult[];
    retrievalStatus: RetrievalStatus;
    modelUsage: ModelUsage;
  } // data parts
>;
