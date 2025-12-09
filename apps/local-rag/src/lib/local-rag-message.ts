import { UIMessage } from "ai";
import type { RetrievalResult } from "./retrieval";

// UI message shape for the chat UI. Adds a data part for retrieval results.
export type LocalRAGMessage = UIMessage<
  never, // metadata
  { retrievalResults: RetrievalResult[] } // data parts
>;
