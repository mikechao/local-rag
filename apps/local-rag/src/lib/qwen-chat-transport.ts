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
    Tool,
    stepCountIs,
    generateText,
    Output,
    ToolLoopAgent,
    createAgentUIStream,
    smoothStream
} from "ai";
import { getQwenModel } from "./models/qwenModel";
import { LocalRAGMessage } from "./local-rag-message";
import { z } from "zod";
import { retrieveChunks } from "./retrieval";

export class QwenChatTransport implements ChatTransport<LocalRAGMessage> {

  private model: LanguageModel;
  private retrievalTool: Tool;
  private chatAgent: ToolLoopAgent<never, {retrieval: Tool}>;

  constructor() {
    this.model = wrapLanguageModel({
      model: getQwenModel(),
      middleware: extractReasoningMiddleware({ tagName: 'think'})
    })
    this.retrievalTool = tool({
      title: 'Document Retrieval',
      description: 'Use this tool to retrieve relevant documents about Stargate Atlantis to answer user queries.',
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
    this.chatAgent = new ToolLoopAgent<never, {retrieval: Tool}>({
      model: this.model,
      instructions: `You are a helpful AI assistant with access to a knowledge retrieval tool.
      All user questions must be answered using the retrieval tool to find relevant information.
      When you receive a user question, use the retrieval tool to get relevant documents, then use that information to formulate your response.`,
      tools: {
        retrieval: this.retrievalTool,
      }
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

    return createAgentUIStream({
      agent: this.chatAgent,
      messages,
      abortSignal,
      experimental_transform: smoothStream({ delayInMs: 10 })
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
