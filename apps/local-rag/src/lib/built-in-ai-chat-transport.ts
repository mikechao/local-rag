import {
  ChatTransport,
  UIMessageChunk,
  ChatRequestOptions,
  ToolLoopAgent,
  createAgentUIStream,
  generateText,
  convertToModelMessages,
  Output,
  smoothStream,
  createUIMessageStream,
  InferUIMessageChunk
} from "ai";
import { z } from "zod";
import { builtInAI } from "@built-in-ai/core";
import type { RetrievalResult } from "./retrieval";
import { retrieveChunks } from "./retrieval";
import { LocalRAGMessage } from "./local-rag-message";

const retrievalResultSchema = z.object({
  chunkIds: z.array(z.string()),
  docId: z.string(),
  docType: z.string(),
  pageNumber: z.number(),
  headingPath: z.string().nullable().optional(),
  text: z.string(),
  similarity: z.number(),
}) satisfies z.ZodType<RetrievalResult>;

const callOptionsSchema = z.object({
  retrievalResults: z.array(retrievalResultSchema).optional(),
});

type CallOptions = z.infer<typeof callOptionsSchema>;

const shouldRetrieveSchema = z.object({
  shouldRetrieve: z.boolean().describe("Whether the user's question requires retrieval of relevant documents."),
  userQuestion: z.string().describe("The user's question that may require retrieval."),
})

// Returns the most recent message sent by the user, or undefined if none exist.
function getLatestUserMessage(
  messages: LocalRAGMessage[],
): LocalRAGMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 *
 * @implements {ChatTransport<LocalRAGMessage>}
 */
export class BuiltInAIChatTransport
  implements ChatTransport<LocalRAGMessage>
{
  private chatAgent: ToolLoopAgent<CallOptions>;
  private chatModel = builtInAI("text", {
    expectedInputs: [{ type: "text" }, { type: "image" }]
  });
  private warmupPromise: Promise<void> | null = null;

  constructor() {
    this.chatAgent = new ToolLoopAgent<CallOptions>({
      model: this.chatModel,
      instructions: 'You are a helpful assistant. Answer user questions the best you can.',
      callOptionsSchema,
      prepareCall: ({ options, prompt, ...settings }) => {
        const retrievalResults = options?.retrievalResults;
        
        // If we have retrieval results, inject them into the conversation as an assistant message
        if (retrievalResults && retrievalResults.length > 0 && Array.isArray(prompt)) {
          const contextText = retrievalResults
            .map((r) => `${r.text}\n(Source: ${r.docId})`)
            .join("\n\n---\n\n");
          
          // Insert an assistant message with the context before the last user message
          const lastIndex = prompt.length - 1;
          const modifiedPrompt = [
            ...prompt.slice(0, lastIndex),
            {
              role: 'assistant' as const,
              content: `I found the following relevant information from the knowledge base:\n\n${contextText}\n\nI'll use this information to answer your question.`,
            },
            prompt[lastIndex], // The user's question
          ];
          
          console.log('[prepareCall] Injected RAG context as assistant message');
          
          return {
            ...settings,
            prompt: modifiedPrompt,
          };
        }
        
        return {
          ...settings,
          prompt,
        };
      },
    })
  }

  /**
   * Pre-initializes the chat model session with the correct system message.
   * This warms up the model and caches the session for faster subsequent calls.
   * Safe to call multiple times - subsequent calls return the same promise.
   */
  async warmup(): Promise<void> {
    // Return existing warmup promise if already warming up or completed
    if (this.warmupPromise) {
      return this.warmupPromise;
    }
    
    this.warmupPromise = (async () => {
      console.log("[Warmup] Starting chat model warmup...");
      const start = performance.now();
      try {
        // Make a minimal call to establish the session with the correct system message
        await generateText({
          model: this.chatModel,
          system: 'You are a helpful assistant. Answer user questions the best you can.',
          messages: [{ role: 'user', content: 'hi' }],
        });
        console.log(`[Warmup] Chat model warmed up in ${(performance.now() - start).toFixed(2)}ms`);
      } catch (e) {
        console.warn("[Warmup] Chat model warmup failed (non-fatal):", e);
      }
    })();
    
    return this.warmupPromise;
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: LocalRAGMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: "submit-message" | "submit-tool-result" | "regenerate-message";
      messageId: string | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;

    const retrievalResults: RetrievalResult[] | undefined = await this.getRetrievalResults(
      messages,
      abortSignal,
    );

    const agentStreamPromise = createAgentUIStream({
      agent: this.chatAgent,
      messages,
      options: { retrievalResults },
      abortSignal,
      experimental_transform: smoothStream({ delayInMs: 10 }),
    });

    return createUIMessageStream<LocalRAGMessage>({
      execute: async ({ writer }) => {
        const agentStream = await agentStreamPromise;

        // Forward the agent's stream to the UI stream.
        writer.merge(
          agentStream as ReadableStream<InferUIMessageChunk<LocalRAGMessage>>
        );

        // Send retrieval results as a data part after the model completes.
        if (retrievalResults?.length) {
          writer.write({
            type: "data-retrievalResults",
            data: retrievalResults,
            transient: false,
          });
        }
      },
    });
  }

  async getRetrievalResults(
    messages: LocalRAGMessage[],
    abortSignal: AbortSignal | undefined,
  ): Promise<RetrievalResult[] | undefined> {
    const lastUserMessage = getLatestUserMessage(messages);
    if (lastUserMessage === undefined) {
      return undefined;
    }
    const systemMessage = {
      role: "assistant" as const,
      parts: [
        {
          type: "text" as const,
          text: "Determine if the user message requires retrieval from the knowledge base to provide a better answer." 
            + " The knowledge base contains information about Stargate Atlantis.",
        }
      ],
      id: "system-message-id"
    };
    const before = performance.now();
    const result = await generateText({
      model: builtInAI(),
      messages: convertToModelMessages([systemMessage, lastUserMessage]),
      output: Output.object({
        schema: shouldRetrieveSchema,
      }),
      abortSignal,
    })
    const after = performance.now();
    console.log(`retrieval decision took ${after - before} ms shouldRetrieve: ${result.output.shouldRetrieve} userQuestion: ${result.output.userQuestion}`);
    const { shouldRetrieve, userQuestion } = result.output;
    if (!shouldRetrieve) {
      return undefined;
    }
    const retrievalResults = await retrieveChunks(userQuestion);
    return retrievalResults.results;
  }

  async reconnectToStream(
    _options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Client-side AI doesn't support stream reconnection
    return null;
  }
}
