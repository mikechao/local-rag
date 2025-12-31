import { builtInAI } from "@built-in-ai/core";
import { generateText } from "ai";
import type { LocalRAGMessage } from "@/lib/local-rag-message";

function getMessageText(message: LocalRAGMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * Split messages into exactly 2 chunks for summarization.
 * Since summarization is only called on quota overflow, we know the conversation
 * is long enough to warrant splitting. Two chunks should fit within the model's
 * context window for a fresh summarization session.
 */
function splitMessagesInHalf(
  messages: LocalRAGMessage[],
): [LocalRAGMessage[], LocalRAGMessage[]] {
  const midpoint = Math.ceil(messages.length / 2);
  return [messages.slice(0, midpoint), messages.slice(midpoint)];
}

async function summarizeChunk(
  model: ReturnType<typeof builtInAI>,
  messages: LocalRAGMessage[],
  chunkIndex: number,
  totalChunks: number,
): Promise<string> {
  // Extract just the text content without role labels to avoid meta-commentary
  const conversationText = messages
    .map((message) => getMessageText(message))
    .filter(Boolean)
    .join("\n\n");

  const chunkPrefix =
    totalChunks > 1
      ? `This is part ${chunkIndex + 1} of ${totalChunks}.\n\n`
      : "";

  const result = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "Summarize the factual information discussed. Write directly and concisely. Include locations, names, events, concepts, and specific details. Exclude conversational pleasantries, thanks, or acknowledgments. STRICT LIMIT: 75 words maximum.",
      },
      {
        role: "user",
        content: chunkPrefix + conversationText,
      },
    ],
  });

  return result.text.trim();
}

/**
 * Summarizes a chat conversation using hierarchical summarization.
 *
 * This function is called when quota overflow occurs, meaning the conversation is already
 * very long and exceeds the AI model's context window. To handle this, we use a hierarchical
 * approach rather than truncating content:
 *
 * 1. **Chunking**: Split the conversation into exactly 2 chunks by dividing messages at the
 *    midpoint. This ensures both the beginning and end of the conversation are captured, while
 *    keeping each chunk small enough to fit within the model's token limits for a fresh session.
 *
 * 2. **Chunk Summarization**: Each chunk is independently summarized sequentially, capturing
 *    key information from both halves of the conversation.
 *
 * 3. **Concatenation**: The two chunk summaries are concatenated together (not synthesized)
 *    to preserve all information from both parts of the conversation.
 *
 * This approach ensures no information is lost from any part of the conversation, unlike
 * simple truncation which would only capture the first N characters.
 *
 * @param messages - Array of conversation messages to summarize
 * @returns A summary combining key topics, facts, and concepts from both halves of the conversation
 * @throws Error if messages array is empty or contains no text content
 */
export async function summarizeChat(
  messages: LocalRAGMessage[],
): Promise<string> {
  if (messages.length === 0) {
    throw new Error("No messages to summarize");
  }
  const before = performance.now();
  const conversationText = messages
    .map((message) => {
      const text = getMessageText(message);
      return text ? `${message.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (!conversationText.trim()) {
    throw new Error("No text content to summarize");
  }

  // Split into exactly 2 chunks - this is sufficient since we're starting a fresh session
  const [firstHalf, secondHalf] = splitMessagesInHalf(messages);
  const chunks = [firstHalf, secondHalf].filter((chunk) => chunk.length > 0);

  // Create single model instance to reuse across all chunk summarizations (session caching)
  const chunkModel = builtInAI("text", {
    expectedInputs: [{ type: "text" }],
  });

  // Summarize each chunk sequentially (Gemini Nano is single-threaded, so parallel would just queue up)
  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const summary = await summarizeChunk(
      chunkModel,
      chunks[i],
      i,
      chunks.length,
    );
    chunkSummaries.push(summary);
  }

  // If only one chunk (rare, but possible for shorter quota-exceeded chats)
  if (chunkSummaries.length === 1) {
    return chunkSummaries[0];
  }

  // Concatenate the two chunk summaries
  const combinedSummary = chunkSummaries.join("\n\n");

  const after = performance.now();
  console.log(
    `[Chat Summarization] Summarized ${messages.length} messages in ${(
      (after - before) / 1000
    ).toFixed(2)} seconds using ${chunks.length} chunks.`,
  );
  return combinedSummary;
}
