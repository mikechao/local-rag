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

function chunkMessages(
  messages: LocalRAGMessage[],
  maxCharsPerChunk: number,
): LocalRAGMessage[][] {
  const chunks: LocalRAGMessage[][] = [];
  let currentChunk: LocalRAGMessage[] = [];
  let currentChunkSize = 0;

  for (const message of messages) {
    const text = getMessageText(message);
    const messageText = text ? `${message.role}: ${text}` : "";
    const messageSize = messageText.length + 2; // +2 for \n\n

    // If adding this message exceeds limit and we have messages in current chunk, start new chunk
    if (currentChunkSize + messageSize > maxCharsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [message];
      currentChunkSize = messageSize;
    } else {
      currentChunk.push(message);
      currentChunkSize += messageSize;
    }
  }

  // Add the last chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function summarizeChunk(
  messages: LocalRAGMessage[],
  chunkIndex: number,
  totalChunks: number,
): Promise<string> {
  const conversationText = messages
    .map((message) => {
      const text = getMessageText(message);
      return text ? `${message.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const chunkLabel = totalChunks > 1 ? ` (part ${chunkIndex + 1} of ${totalChunks})` : "";
  
  const result = await generateText({
    model: builtInAI("text", {
      expectedInputs: [{ type: "text" }],
    }),
    messages: [
      {
        role: "system",
        content:
          `Extract key information from this conversation segment${chunkLabel}. Focus ONLY on the factual content discussed: main topics, facts, names, places, concepts. Do NOT describe what the assistant did or how the conversation flowed. Be concise.`,
      },
      {
        role: "user",
        content: conversationText,
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
 * 1. **Chunking**: Split the conversation into smaller chunks (~3500 chars each) that fit
 *    within the model's token limits, keeping messages intact (never split mid-message).
 * 
 * 2. **Chunk Summarization**: Each chunk is independently summarized in parallel, capturing
 *    key information from the beginning, middle, and end of the conversation.
 * 
 * 3. **Final Synthesis**: If multiple chunks exist, their summaries are combined and 
 *    synthesized into one coherent summary that represents the entire conversation.
 * 
 * This approach ensures no information is lost from any part of the conversation, unlike
 * simple truncation which would only capture the first N characters.
 * 
 * @param messages - Array of conversation messages to summarize
 * @returns A concise summary (under 150 words) of the key topics, facts, and concepts discussed
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

  const MAX_CHARS_PER_CHUNK = 5000; // Larger chunks = fewer AI calls for faster summarization

  // Always use hierarchical summarization since this is called on quota overflow (long conversations)
  const chunks = chunkMessages(messages, MAX_CHARS_PER_CHUNK);

  // Summarize each chunk
  const chunkSummaries = await Promise.all(
    chunks.map((chunk, index) => summarizeChunk(chunk, index, chunks.length)),
  );

  // If only one chunk (rare, but possible for shorter quota-exceeded chats)
  if (chunkSummaries.length === 1) {
    return chunkSummaries[0];
  }

  // Combine chunk summaries into final summary
  const combinedText = chunkSummaries
    .map((summary, index) => `Part ${index + 1}: ${summary}`)
    .join("\n\n");

  const finalResult = await generateText({
    model: builtInAI("text", {
      expectedInputs: [{ type: "text" }],
    }),
    messages: [
      {
        role: "system",
        content:
          "Combine these summaries into one coherent summary of the factual content discussed. Include key topics, facts, names, places, and concepts. Do NOT include commentary about the conversation itself or what the assistant did. Keep under 150 words.",
      },
      {
        role: "user",
        content: combinedText,
      },
    ],
  });
  const after = performance.now();
  console.log(
    `[Chat Summarization] Summarized ${messages.length} messages in ${
      ((after - before) / 1000).toFixed(2)
    } seconds using ${chunks.length} chunks.`,
  );
  return finalResult.text.trim();
}
