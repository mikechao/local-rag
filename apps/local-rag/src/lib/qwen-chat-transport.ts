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
import { RetrievalResult, retrieveChunks } from "./retrieval";

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
  messages: LocalRAGMessage[],
): LocalRAGMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

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

    const retrievalResults: RetrievalResult[] | undefined = await this.getRetrievalResults(
      messages,
      abortSignal,
    );

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

    async getRetrievalResults(
      messages: LocalRAGMessage[],
      abortSignal: AbortSignal | undefined,
    ): Promise<RetrievalResult[] | undefined> {
      const lastUserMessage = getLatestUserMessage(messages);
      if (lastUserMessage === undefined) {
        return undefined;
      }
      const systemMessage = {
        role: "assistant" as const,
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
      const result = await generateText({
        model: this.model,
        messages: convertToModelMessages([systemMessage, lastUserMessage]),
        output: Output.object({
          schema: shouldRetrieveSchema,
        }),
        abortSignal,
      })
      const after = performance.now();
      console.log(`retrieval decision took ${after - before} ms shouldRetrieve: ${result.output.shouldRetrieve} userQuestion: ${result.output.userQuestion}`);
      const { shouldRetrieve, userQuestion } = result.output;
      if (!shouldRetrieve) {
        return undefined;
      }
      const retrievalResults = await retrieveChunks(userQuestion);
      return retrievalResults.results;
    }
}
