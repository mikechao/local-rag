import {
    ChatRequestOptions,
    ChatTransport,
    LanguageModel,
    UIMessageChunk,
    convertToModelMessages,
    streamText,
    wrapLanguageModel, 
    extractReasoningMiddleware,
    tool,
    Tool
} from "ai";
import { getQwenModel } from "./models/qwenModel";
import { LocalRAGMessage } from "./local-rag-message";
import { z } from "zod";
import { retrieveChunks } from "./retrieval";

export class QwenChatTransport implements ChatTransport<LocalRAGMessage> {

  private model: LanguageModel
  private retrievalTool: Tool

  constructor() {
    this.model = wrapLanguageModel({
      model: getQwenModel(),
      middleware: extractReasoningMiddleware({ tagName: 'think'})
    })
    this.retrievalTool = tool({
      title: 'Document Retrieval',
      description: 'Use this tool to retrieve relevant documents to answer user queries.',
      inputSchema: z.object({
        query: z.string().describe('The user query to retrieve documents for.'),
      }),
      execute: async ({ query }) => {
        console.log('Retrieving documents for query:', query);
        const retrievalResult = await retrieveChunks(query);
        if (retrievalResult.results.length === 0) {
          return 'No relevant documents found.';
        }
        return retrievalResult.results.map((r) => r.text).join('\n\n');}
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
      model: this.model,
      system: `You are an AI assistant that helps users by providing accurate and concise information. Use the 'document-retrieval' tool to assist in answering user queries effectively about Stargate Atlantis.`,
      messages: convertToModelMessages(messages),
      tools: {
        'document-retrieval': this.retrievalTool,
      },
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
