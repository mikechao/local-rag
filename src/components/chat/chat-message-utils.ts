import type { FileUIPart } from "ai";
import type { LocalRAGMessage } from "@/lib/local-rag-message";

export const getMessageText = (message: LocalRAGMessage) => {
  if (message.parts) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }
  return "";
};

export const getCopyableText = (message: LocalRAGMessage) => {
  if (message.parts) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return getMessageText(message);
};

export const getAttachments = (message: LocalRAGMessage): FileUIPart[] => {
  if (!message.parts) return [];
  return message.parts
    .filter((part): part is FileUIPart => part.type === "file")
    .map((part) => ({
      ...part,
      url: part.url,
      mediaType: part.mediaType,
      filename: part.filename || "Image",
    }));
};
