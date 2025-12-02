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
} from "drizzle-orm/pg-core"

const oid = customType<{ data: number; driverData: number }>({
	dataType() {
		return "oid"
	},
	toDriver(value) {
		return value
	},
	fromDriver(value) {
		return Number(value)
	},
})

export const documents = pgTable("documents", {
	id: text("id").primaryKey(),
	filename: text("filename").notNull(),
	mime: text("mime").notNull(),
	size: integer("size").notNull(),
	blobOid: oid("blob_oid").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

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
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		embedded: boolean("embedded").default(false).notNull(),
	},
	(table) => [
		index("doc_id_idx").on(table.docId),
		index("doc_id_page_idx").on(table.docId, table.pageNumber),
		index("embedded_idx").on(table.embedded),
	],
)

export const chunkEmbeddings = pgTable(
	"chunk_embeddings",
	{
		chunkId: text("chunk_id")
			.notNull()
			.references(() => documentChunks.id, { onDelete: "cascade" }),
		embeddingModel: text("embedding_model").notNull(),
		embedding: vector("embedding", { dimensions: 384 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.chunkId, table.embeddingModel] })],
)

export type Document = typeof documents.$inferSelect
export type InsertDocument = typeof documents.$inferInsert
export type DocumentChunk = typeof documentChunks.$inferSelect
export type InsertDocumentChunk = typeof documentChunks.$inferInsert
export type ChunkEmbedding = typeof chunkEmbeddings.$inferSelect
