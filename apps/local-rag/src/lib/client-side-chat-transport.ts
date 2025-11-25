import {
  ChatTransport,
  UIMessageChunk,
  streamText,
  ChatRequestOptions,
  convertToModelMessages,
} from "ai";
import { builtInAI, BuiltInAIUIMessage } from "@built-in-ai/core";
import { getQwenModel } from "./models/qwenModel";

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
    const { messages, abortSignal, body } = options;

    // Convert UI messages to Model messages
    // We need to massage the input slightly because the UI sends 'data' (base64) for files,
    // but the SDK expects 'url' (data URL) for FileUIPart.
    const prompt = convertToModelMessages(
      messages.map((m) => ({
        ...m,
        parts: m.parts.map((p) => {
          if (p.type === "file" && (p as any).data) {
            const filePart = p as any;
            const mediaType = filePart.mimeType || filePart.mediaType;
            return {
              type: "file",
              url: `data:${mediaType};base64,${filePart.data}`,
              mediaType: mediaType,
              filename: filePart.filename,
            };
          }
          return p;
        }),
      })) as any,
    ).map((m) => {
      // Post-processing: The transformers-js provider expects 'image' parts for vision,
      // but convertToModelMessages produces 'file' parts.
      // We convert 'file' parts with image mime types to 'image' parts.
      if (Array.isArray(m.content)) {
        m.content = (m.content as any[]).map((p) => {
          if (p.type === "file" && p.mimeType?.startsWith("image/")) {
            return {
              type: "image",
              image: p.data,
              mimeType: p.mimeType,
            };
          }
          return p;
        });
      }
      return m;
    });

    const modelId = (body as any)?.modelId;
    let model;

    if (modelId === "qwen3-0.6b") {
      model = getQwenModel();
    } else {
      // Default to Gemini Nano
      model = builtInAI();
    }

    // Check if model is available
    const availability = await model.availability();
    
    if (availability === "unavailable") {
      throw new Error(
        "Model is not available. Please download it from the Models page.",
      );
    }

    const result = streamText({
      model,
      messages: prompt,
      abortSignal: abortSignal,
    });
    return result.toUIMessageStream({
      sendReasoning: true,
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
