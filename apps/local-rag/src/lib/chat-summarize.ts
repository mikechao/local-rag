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

  const result = await generateText({
    model: builtInAI("text"),
    messages: [
      {
        role: "system",
        content:
          "Provide a concise summary of the conversation, highlighting key topics discussed, questions asked, and important information shared. Keep it under 100 words.",
      },
      {
        role: "user",
        content: conversationText,
      },
    ],
  });

  return result.text.trim();
}
