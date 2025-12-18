import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  chatMessageParts,
  chatMessages,
  chats,
  type Chat,
  type ChatMessagePart,
  type InsertChatMessagePart,
} from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";
import type { LocalRAGMessage } from "@/lib/local-rag-message";
import type { RetrievalResult } from "@/lib/retrieval";

const ATTACHMENT_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_TITLE = "New Chat";

type DbClient = Awaited<ReturnType<typeof getDb>>;
type DbTransaction = Parameters<DbClient["transaction"]>[0] extends (
  tx: infer TX,
) => unknown
  ? TX
  : never;
type LocalRAGMessagePart = NonNullable<LocalRAGMessage["parts"]>[number];

export type ChatSummary = Pick<Chat, "id" | "title" | "createdAt" | "updatedAt">;

function* chunkBuffer(bytes: Uint8Array, chunkSize = ATTACHMENT_CHUNK_BYTES) {
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    yield bytes.slice(offset, Math.min(offset + chunkSize, bytes.length));
  }
}

async function storeBlob(tx: DbTransaction, blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const createRes = await tx.execute<{ oid: number }>(
    sql`select lo_create(0) as oid`,
  );
  const blobOid = createRes.rows[0]?.oid;
  if (blobOid == null) {
    throw new Error("Failed to allocate large object");
  }

  const fdRes = await tx.execute<{ fd: number }>(
    sql`select lo_open(${blobOid}, 131072) as fd`,
  );
  const fd = fdRes.rows[0]?.fd;
  if (fd == null) {
    throw new Error("Failed to open large object");
  }

  for (const chunk of chunkBuffer(bytes)) {
    await tx.execute(sql`select lowrite(${fd}, ${chunk})`);
  }

  await tx.execute(sql`select lo_close(${fd})`);
  return blobOid;
}

async function readBlob(
  blobOid: number,
  mime: string,
): Promise<{ blob: Blob; url: string }> {
  await ensureDbReady();
  const db = await getDb();
  const loResult = await db.execute<{ data: Uint8Array }>(
    sql`select lo_get(${blobOid}) as data`,
  );
  const loRow = loResult.rows[0];
  if (!loRow) {
    throw new Error("Attachment data missing");
  }

  const blob = new Blob([loRow.data as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  return { blob, url };
}

function getMessageText(message: LocalRAGMessage) {
  if (!message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function serializeMessageParts(message: LocalRAGMessage) {
  return message.parts ?? [];
}

async function mapUIMessagePartsToDBParts(
  parts: LocalRAGMessage["parts"],
  messageId: string,
  tx: DbTransaction,
): Promise<InsertChatMessagePart[]> {
  if (!parts || parts.length === 0) return [];

  const mapped: InsertChatMessagePart[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.type === "text") {
      mapped.push({
        id: crypto.randomUUID(),
        messageId,
        order: index,
        type: part.type,
        textText: part.text,
      });
      continue;
    }

    if (part.type === "reasoning") {
      mapped.push({
        id: crypto.randomUUID(),
        messageId,
        order: index,
        type: part.type,
        reasoningText: part.text,
      });
      continue;
    }

    if (part.type === "file") {
      const response = await fetch(part.url);
      const blob = await response.blob();
      const blobOid = await storeBlob(tx, blob);
      mapped.push({
        id: crypto.randomUUID(),
        messageId,
        order: index,
        type: part.type,
        fileBlobOid: blobOid,
        fileFilename: part.filename ?? "Attachment",
        fileMime: part.mediaType ?? blob.type,
        fileSize: blob.size,
      });
      continue;
    }

    if (part.type === "data-retrievalResults") {
      mapped.push({
        id: crypto.randomUUID(),
        messageId,
        order: index,
        type: part.type,
        dataRetrievalResults: part.data as RetrievalResult[],
      });
      continue;
    }
  }

  return mapped;
}

async function mapDBPartToUIMessagePart(
  part: ChatMessagePart,
  attachmentUrls: string[],
): Promise<LocalRAGMessagePart | null> {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.textText ?? "" };
    case "reasoning":
      return { type: "reasoning", text: part.reasoningText ?? "" };
    case "file": {
      if (!part.fileBlobOid) return null;
      const { url } = await readBlob(
        part.fileBlobOid,
        part.fileMime ?? "application/octet-stream",
      );
      attachmentUrls.push(url);
      return {
        type: "file",
        url,
        mediaType: part.fileMime ?? "application/octet-stream",
        filename: part.fileFilename ?? "Attachment",
      };
    }
    case "data-retrievalResults":
      return {
        type: "data-retrievalResults",
        data: (part.dataRetrievalResults ?? []) as RetrievalResult[],
      };
    default:
      return null;
  }
}

export async function createChat(title = DEFAULT_TITLE): Promise<ChatSummary> {
  await ensureDbReady();
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(chats).values({ id, title, createdAt: now, updatedAt: now });
  return { id, title, createdAt: now, updatedAt: now };
}

export async function getChats(): Promise<ChatSummary[]> {
  await ensureDbReady();
  const db = await getDb();
  return db
    .select({
      id: chats.id,
      title: chats.title,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .orderBy(asc(chats.createdAt));
}

export async function updateChatTitle(chatId: string, title: string) {
  await ensureDbReady();
  const db = await getDb();
  await db
    .update(chats)
    .set({ title, updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function deleteChat(chatId: string) {
  await ensureDbReady();
  const db = await getDb();
  await db.transaction(async (tx) => {
    const partsWithBlobs = await tx
      .select({ oid: chatMessageParts.fileBlobOid })
      .from(chatMessageParts)
      .innerJoin(chatMessages, eq(chatMessageParts.messageId, chatMessages.id))
      .where(
        and(eq(chatMessages.chatId, chatId), isNotNull(chatMessageParts.fileBlobOid)),
      );

    const blobOids = partsWithBlobs
      .map((row) => row.oid)
      .filter((oid): oid is number => typeof oid === "number");

    for (const oid of blobOids) {
      await tx.execute(sql`select lo_unlink(${oid})`);
    }

    await tx.delete(chats).where(eq(chats.id, chatId));
  });
}

export async function upsertMessage(params: {
  chatId: string;
  message: LocalRAGMessage;
}) {
  await ensureDbReady();
  const db = await getDb();
  const { chatId, message } = params;

  await db.transaction(async (tx) => {
    await tx
      .insert(chatMessages)
      .values({
        id: message.id,
        chatId,
        role: message.role,
      })
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: { chatId },
      });

    const existingBlobRows = await tx
      .select({ oid: chatMessageParts.fileBlobOid })
      .from(chatMessageParts)
      .where(
        and(
          eq(chatMessageParts.messageId, message.id),
          isNotNull(chatMessageParts.fileBlobOid),
        ),
      );

    for (const row of existingBlobRows) {
      if (typeof row.oid === "number") {
        await tx.execute(sql`select lo_unlink(${row.oid})`);
      }
    }

    await tx
      .delete(chatMessageParts)
      .where(eq(chatMessageParts.messageId, message.id));

    const mappedParts = await mapUIMessagePartsToDBParts(
      serializeMessageParts(message),
      message.id,
      tx,
    );

    if (mappedParts.length > 0) {
      await tx.insert(chatMessageParts).values(mappedParts);
    }

    await tx
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));
  });
}

export async function loadChat(chatId: string): Promise<{
  messages: LocalRAGMessage[];
  attachmentUrls: string[];
}> {
  await ensureDbReady();
  const db = await getDb();
  const messageRows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt));

  if (messageRows.length === 0) {
    return { messages: [], attachmentUrls: [] };
  }

  const messageIds = messageRows.map((row) => row.id);
  const partsRows = await db
    .select()
    .from(chatMessageParts)
    .where(inArray(chatMessageParts.messageId, messageIds))
    .orderBy(asc(chatMessageParts.messageId), asc(chatMessageParts.order));

  const partsByMessageId = new Map<string, ChatMessagePart[]>();
  for (const part of partsRows) {
    const list = partsByMessageId.get(part.messageId) ?? [];
    list.push(part);
    partsByMessageId.set(part.messageId, list);
  }

  const attachmentUrls: string[] = [];
  const messages: LocalRAGMessage[] = [];

  for (const message of messageRows) {
    const parts = partsByMessageId.get(message.id) ?? [];
    const uiParts: LocalRAGMessage["parts"] = [];
    for (const part of parts) {
      const mapped = await mapDBPartToUIMessagePart(part, attachmentUrls);
      if (mapped) {
        uiParts.push(mapped);
      }
    }

    messages.push({
      id: message.id,
      role: message.role as LocalRAGMessage["role"],
      parts: uiParts,
    });
  }

  return { messages, attachmentUrls };
}

export function hasUserMessages(messages: LocalRAGMessage[]) {
  return messages.some((message) => message.role === "user");
}

export function buildChatSummary(messages: LocalRAGMessage[]) {
  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => getMessageText(message))
    .filter(Boolean)
    .join("\n");
  return text.trim();
}

export function getDefaultChatTitle() {
  return DEFAULT_TITLE;
}
