import {
    ChatRequestOptions,
    ChatTransport,
    LanguageModel,
    UIMessageChunk,
    convertToModelMessages,
    streamText
} from "ai";
import { ensureSmolLM3ModelReady, getSmolLM3Model } from "./models/smolLM3Model";
import { LocalRAGMessage } from "./local-rag-message";

export class SmolLM3ChatTransport implements ChatTransport<LocalRAGMessage> {

  private model: LanguageModel;

  constructor() {
    ensureSmolLM3ModelReady()
    this.model = getSmolLM3Model();
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
      model: this.model,
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