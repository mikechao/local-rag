import {
    ChatRequestOptions,
    ChatTransport,
    LanguageModel,
    UIMessageChunk,
    convertToModelMessages,
    streamText,
    wrapLanguageModel, 
    extractReasoningMiddleware 
} from "ai";
import { getQwenModel } from "./models/qwenModel";
import { LocalRAGMessage } from "./local-rag-message";

export class QwenChatTransport implements ChatTransport<LocalRAGMessage> {

  private wrappedModel: LanguageModel

  constructor() {
    this.wrappedModel = wrapLanguageModel({
      model: getQwenModel(),
      middleware: extractReasoningMiddleware({ tagName: 'think'})
    })
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: LocalRAGMessage[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;
    const stream = streamText({
      model: this.wrappedModel,
      messages: convertToModelMessages(messages),
      abortSignal,
    })
    return stream.toUIMessageStream({
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
