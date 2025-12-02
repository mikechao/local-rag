import {
  ChatTransport,
  UIMessageChunk,
  streamText,
  ChatRequestOptions,
  convertToModelMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { builtInAI, BuiltInAIUIMessage } from "@built-in-ai/core";
import { getQwenModel } from "./models/qwenModel";
import { retrieveChunks } from "./retrieval";

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
    const prompt = convertToModelMessages(messages);

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
      system: `You are a helpful assistant. Check your knowledge base before answering any questions. 
      If the answer is not in your knowledge base, acknowledgege that it is not in your knowledge base, but
      try to answer as best as you can`,
      stopWhen: stepCountIs(5),
      tools: {
        getInformation: tool({
          description: `get information from your knowledge base to answer questions.`,
          inputSchema: z.object({
            question: z.string().describe("the users question"),
          }),
          execute: async ({ question }) => {
            const { results } = await retrieveChunks(question);
            const joinedResults = results
              .map((r) => `Content: ${r.text}\nSource: ${r.docId}`)
              .join("\n\n");
            console.log('--- Retrieved information ---');
            console.log(joinedResults);
            return joinedResults;
          },
        }),
      },
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
