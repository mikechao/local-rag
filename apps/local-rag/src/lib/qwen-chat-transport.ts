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
    Output
} from "ai";
import { getQwenModel } from "./models/qwenModel";
import { LocalRAGMessage } from "./local-rag-message";
import { z } from "zod";
import { retrieveChunks } from "./retrieval";

export class QwenChatTransport implements ChatTransport<LocalRAGMessage> {

  private model: LanguageModel
  private retrievalTool: Tool
  private shouldRetrieveSchema = z.object({
    shouldRetrieve: z.boolean().describe('Whether the question needs knowledge-base lookup.'),
    reason: z.string().describe('Short rationale for the decision.'),
  })

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

    // Let the model decide if retrieval is needed via a small classification call.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .trim();

    let ragMessages = messages;

    if (lastUser && userText) {
      const decision = await generateText({
        model: this.model,
        messages: convertToModelMessages([
          {
            role: 'system',
            parts: [{
              type: 'text',
              text:
                'Decide if the user question needs knowledge-base lookup (document retrieval). '
                + 'Return JSON with shouldRetrieve boolean and a short reason. Only decide, do not answer the question.',
            }],
          },
          {
            role: 'user',
            parts: [{ type: 'text' as const, text: userText }],
          },
        ]),
        output: Output.object({ schema: this.shouldRetrieveSchema }),
        abortSignal,
      });

      if (decision.output?.shouldRetrieve) {
        const retrieval = await retrieveChunks(userText);
        if (retrieval.results.length > 0) {
          const contextText = retrieval.results
            .map((r) => r.text)
            .join("\n\n---\n\n");
          const contextMessage: LocalRAGMessage = {
            role: 'assistant',
            id: 'retrieval-context',
            parts: [{ type: 'text', text: `Context from the knowledge base (use only this to answer):\n\n${contextText}` }],
          };

          const idx = messages.lastIndexOf(lastUser);
          ragMessages = [
            ...messages.slice(0, idx),
            contextMessage,
            ...messages.slice(idx),
          ];
        }
      }
    }

    const stream = streamText({
      model: this.model,
      system: `You are an AI assistant grounded in a local knowledge base about Stargate Atlantis.
Always call the document-retrieval tool before you attempt to answer a user question, even if you think you know the answer from prior knowledge.
After you receive the tool result, use only that information to craft a concise answer. If the tool returns no results, say so.`,
      messages: convertToModelMessages(ragMessages),
      tools: {
        'document-retrieval': this.retrievalTool,
      },
      stopWhen: stepCountIs(5),
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
