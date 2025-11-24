import {
  ChatTransport,
  UIMessageChunk,
  streamText,
  convertToModelMessages,
  ChatRequestOptions,
  UIMessage,
} from "ai";
import { builtInAI } from "@built-in-ai/core";

type ClientSideChatTransportOptions = {
  getSystemPrompt?: () => string | undefined;
};

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 *
 * @implements {ChatTransport<UIMessage>}
 */
export class ClientSideChatTransport
  implements ChatTransport<UIMessage>
{
  private readonly getSystemPrompt?: () => string | undefined;

  constructor(options?: ClientSideChatTransportOptions) {
    this.getSystemPrompt = options?.getSystemPrompt;
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: UIMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: "submit-message" | "submit-tool-result" | "regenerate-message";
      messageId: string | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { chatId, messages, abortSignal } = options;

    const systemPrompt = this.getSystemPrompt?.()?.trim();

    console.log("ClientSideChatTransport sendMessages systemPrompt:", systemPrompt);

    const prompt = convertToModelMessages(messages);
    const model = builtInAI();

    // Check if model is available
    const availability = await model.availability();
    if (availability !== "available") {
      throw new Error("Model is not available. Please download it from the Models page.");
    }

    const result = streamText({
      model,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: prompt,
      abortSignal: abortSignal,
    });
    return result.toUIMessageStream();
  }

  async reconnectToStream(
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Client-side AI doesn't support stream reconnection
    return null;
  }
}
