import { UIMessage } from "ai";
import type { RetrievalResult } from "./retrieval";

export type LocalRAGMessage = UIMessage<
    never, // No custom metadata type
    {
        retrievalResults: {
            results?: RetrievalResult[]
        };
    }
>