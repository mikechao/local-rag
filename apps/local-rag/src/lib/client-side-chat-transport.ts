import {
  ChatTransport,
  UIMessageChunk,
  ChatRequestOptions,
  ToolLoopAgent,
  createAgentUIStream,
} from "ai";
import { z } from "zod";
import { builtInAI, BuiltInAIUIMessage } from "@built-in-ai/core";
import { getQwenModel } from "./models/qwenModel";
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
  modelId: z.enum(["gemini-nano", "qwen3-0.6b"]).optional(),
  retrievalResults: z.array(retrievalResultSchema).optional(),
});

type CallOptions = z.infer<typeof callOptionsSchema>;

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
      model: builtInAI(), // default to Gemini Nano
      instructions: 'You are a helpful assistant. Answer user questions the best you can.',
      callOptionsSchema,
      prepareCall: ({ options, ...settings }) => ({
        ...settings,
        model: options.modelId === "qwen3-0.6b" ? getQwenModel() : builtInAI(),
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
    const { messages, abortSignal, body } = options;

    const modelId = (body as any)?.modelId;
    let retrievalResults: RetrievalResult[] | undefined;
    const latestUserMessage = getLatestUserMessage(messages);
    if (latestUserMessage) {
      console.log('latestUserMessage', JSON.stringify(latestUserMessage));
    }

    // createAgentUIStream expects UI messages (with id and parts), not model messages
    return createAgentUIStream({
      agent: this.chatAgent,
      messages: messages,
      options: {
        modelId,
        retrievalResults,
      },
      abortSignal,
    });
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
