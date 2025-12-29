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

export async function summarizeChat(
  messages: LocalRAGMessage[],
): Promise<string> {
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

  console.log("[ChatSummarize] Conversation length:", conversationText.length, "chars");
  console.log("[ChatSummarize] Message count:", messages.length);
  
  // Truncate if too long (Gemini Nano has token limits)
  const MAX_CHARS = 4000;
  const truncatedText = conversationText.length > MAX_CHARS 
    ? conversationText.substring(0, MAX_CHARS) + "\n\n[...conversation truncated...]"
    : conversationText;

  console.log("[ChatSummarize] Using text length:", truncatedText.length, "chars");

  const result = await generateText({
    model: builtInAI("text", {
      expectedInputs: [{ type: "text" }],
    }),
    messages: [
      {
        role: "system",
        content:
          "You are a summarization assistant. Extract and summarize the key information from the conversation. Focus on main topics, important facts, names, places, and questions asked. Do NOT provide commentary or evaluation. Keep under 100 words.",
      },
      {
        role: "user",
        content: truncatedText,
      },
    ],
  });
  
  console.log("[ChatSummarize] Result:", result);
  console.log("[ChatSummarize] Generated summary:", result.text);
  
  return result.text.trim();
}
