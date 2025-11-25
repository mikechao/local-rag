import {
  ChatTransport,
  UIMessageChunk,
  streamText,
  ChatRequestOptions,
} from "ai";
import { builtInAI, BuiltInAIUIMessage } from "@built-in-ai/core";

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 *
 * @implements {ChatTransport<BuiltInAIUIMessage>}
 */
export class ClientSideChatTransport
  implements ChatTransport<BuiltInAIUIMessage>
{
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

    console.log("ClientSideChatTransport sendMessages called with messages:", messages);

    // Manually convert messages to preserve data in file parts
    // convertToModelMessages from ai SDK might strip data from file parts
    const prompt = messages.map((m) => ({
      role: m.role,
      content: m.parts.map((p) => {
        if (p.type === "file") {
          const filePart = p as any;
          const mediaType = filePart.mimeType || filePart.mediaType;

          if (mediaType?.startsWith("image/")) {
            return {
              type: "image",
              image: filePart.data,
              mimeType: mediaType,
            };
          }

          return {
            type: "file",
            data: filePart.data,
            mimeType: mediaType,
          };
        }
        return p;
      }),
    })) as any;

    const model = builtInAI();
    console.log('Converted messages for model:', prompt);
    // Check if model is available
    const availability = await model.availability();
    if (availability !== "available") {
      throw new Error(
        "Model is not available. Please download it from the Models page.",
      );
    }

    const result = streamText({
      model,
      messages: prompt,
      abortSignal: abortSignal,
    });
    return result.toUIMessageStream();
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
