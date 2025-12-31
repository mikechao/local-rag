import { builtInAI } from "@built-in-ai/core";
import { generateText } from "ai";
import type { LocalRAGMessage } from "@/lib/local-rag-message";

const TITLE_MAX_CHARS = 40;

function getMessageText(message: LocalRAGMessage) {
  if (!message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toTitleCase(input: string) {
  return input
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeTitle(raw: string) {
  const cleaned = raw
    .replace(/["“”'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  let title = toTitleCase(cleaned);
  if (title.length > TITLE_MAX_CHARS) {
    const sliced = title.slice(0, TITLE_MAX_CHARS).trim();
    const trimmed = sliced.includes(" ")
      ? sliced.replace(/\s+\S*$/, "").trim()
      : sliced;
    title = trimmed || sliced;
  }

  return title;
}

export async function generateChatTitle(
  messages: LocalRAGMessage[],
): Promise<string | null> {
  // Limit to first 2 messages (typically user + assistant) for focused titles
  const relevantMessages = messages.slice(0, 2);
  
  const conversationText = relevantMessages
    .map((message) => getMessageText(message))
    .filter(Boolean)
    .join("\n");

  if (!conversationText.trim()) {
    return null;
  }

  try {
    const result = await generateText({
      model: builtInAI("text"),
      messages: [
        {
          role: "system",
          content:
            "You create concise chat titles. Respond with a short title in Title Case. Max 40 characters.",
        },
        {
          role: "user",
          content: conversationText,
        },
      ],
    });

    const normalized = normalizeTitle(result.text);
    if (!normalized) return null;
    return normalized;
  } catch (error) {
    console.warn("[ChatTitle] Failed to generate title", error);
    return null;
  }
}
