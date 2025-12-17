import { UIMessage } from "ai";
import type { RetrievalResult } from "./retrieval";

export type RetrievalStatus =
  | { phase: "deciding"; message?: string }
  | { phase: "skipped"; message?: string }
  | { phase: "retrieving"; query?: string; message?: string }
  | { phase: "done"; resultsCount: number; tookMs?: number; message?: string }
  | { phase: "error"; message: string };

// UI message shape for the chat UI. Adds a data part for retrieval results.
export type LocalRAGMessage = UIMessage<
  never, // metadata
  {
    retrievalResults: RetrievalResult[];
    retrievalStatus: RetrievalStatus;
  } // data parts
>;
