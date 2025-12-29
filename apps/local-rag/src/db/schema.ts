import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector,
  customType,
  boolean,
  index,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

const oid = customType<{ data: number; driverData: number }>({
  dataType() {
    return "oid";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Number(value);
  },
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  blobOid: oid("blob_oid").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: text("id").primaryKey(), // hash of document_id + page_number + chunk_index
    docId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    pageNumber: integer("page_number").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    headingPath: text("heading_path"),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    embedded: boolean("embedded").default(false).notNull(),
  },
  (table) => [
    index("doc_id_idx").on(table.docId),
    index("doc_id_page_idx").on(table.docId, table.pageNumber),
    index("embedded_idx").on(table.embedded),
  ],
);

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    chunkId: text("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    embeddingModel: text("embedding_model").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.chunkId, table.embeddingModel] })],
);

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().notNull().default(1),
  rerankMinScore: doublePrecision("rerank_min_score").notNull().default(0.75),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chats = pgTable("chats", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  quotaOverflowState: boolean("quota_overflow_state").notNull().default(false),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("chat_messages_chat_id_idx").on(table.chatId),
    index("chat_messages_chat_id_created_at_idx").on(
      table.chatId,
      table.createdAt,
    ),
  ],
);

export const chatMessageParts = pgTable(
  "chat_message_parts",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    order: integer("order").notNull().default(0),

    textText: text("text_text"),
    reasoningText: text("reasoning_text"),

    fileBlobOid: oid("file_blob_oid"),
    fileFilename: text("file_filename"),
    fileMime: text("file_mime"),
    fileSize: integer("file_size"),

    dataRetrievalResults: jsonb("data_retrieval_results"),
    dataModelUsage: jsonb("data_model_usage"),
  },
  (table) => [
    index("chat_message_parts_message_id_idx").on(table.messageId),
    index("chat_message_parts_message_id_order_idx").on(
      table.messageId,
      table.order,
    ),
  ],
);

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;
export type ChunkEmbedding = typeof chunkEmbeddings.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type InsertChat = typeof chats.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type ChatMessagePart = typeof chatMessageParts.$inferSelect;
export type InsertChatMessagePart = typeof chatMessageParts.$inferInsert;
