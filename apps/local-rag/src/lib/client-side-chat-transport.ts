import {
  ChatTransport,
  UIMessageChunk,
  ChatRequestOptions,
  ToolLoopAgent,
  createAgentUIStream,
  generateText,
  convertToModelMessages,
  Output
} from "ai";
import { z } from "zod";
import { builtInAI, BuiltInAIUIMessage } from "@built-in-ai/core";
import type { RetrievalResult } from "./retrieval";
import { retrieveChunks } from "./retrieval";

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
  messages: BuiltInAIUIMessage[],
): BuiltInAIUIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 *
 * @implements {ChatTransport<BuiltInAIUIMessage>}
 */
export class ClientSideChatTransport
  implements ChatTransport<BuiltInAIUIMessage>
{

  private chatAgent: ToolLoopAgent<CallOptions>;

  constructor() {
    this.chatAgent = new ToolLoopAgent<CallOptions>({
      model: builtInAI(),
      instructions: 'You are a helpful assistant. Answer user questions the best you can.',
      callOptionsSchema,
      prepareCall: ({ options, ...settings }) => ({
        ...settings,
        instructions: settings.instructions + (options.retrievalResults
          ? ` Use the following retrieval results to inform your answers: ${options.retrievalResults
              .map(
                (r) =>
                  `Content: ${r.text}\nSource: ${r.docId}\n`,
              )
              .join("\n")}`
          : ""),
      }),
    })
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: BuiltInAIUIMessage[];
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
    
    // createAgentUIStream expects UI messages (with id and parts), not model messages
    return createAgentUIStream({
      agent: this.chatAgent,
      messages: messages,
      options: {
        retrievalResults,
      },
      abortSignal,
    });
  }

  async getRetrievalResults(
    messages: BuiltInAIUIMessage[],
    abortSignal: AbortSignal | undefined,
  ): Promise<RetrievalResult[] | undefined> {
    const lastUserMessage = getLatestUserMessage(messages);
    if (lastUserMessage === undefined) {
      return undefined;
    }
    const systemMessage = {
      role: "system" as const,
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
    console.log('before retrieval decision');
    const result = await generateText({
      model: builtInAI(),
      messages: convertToModelMessages([systemMessage, lastUserMessage]),
      output: Output.object({
        schema: shouldRetrieveSchema,
      }),
      abortSignal,
    })
    const after = performance.now();
    console.log(`retrieval decision took ${after - before} ms`);
    const { shouldRetrieve, userQuestion } = result.output;
    console.log('shouldRetrieve', shouldRetrieve);
    console.log('userQuestion', userQuestion);
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
