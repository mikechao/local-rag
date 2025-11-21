import {
	bytea,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	vector,
} from "drizzle-orm/pg-core"

export const documents = pgTable("documents", {
	id: text("id").primaryKey(),
	filename: text("filename").notNull(),
	mime: text("mime").notNull(),
	size: integer("size").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const docChunks = pgTable(
	"doc_chunks",
	{
		docId: text("doc_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		chunkNo: integer("chunk_no").notNull(),
		data: bytea("data").notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.docId, table.chunkNo] }),
	}),
)

export const docText = pgTable(
	"doc_text",
	{
		docId: text("doc_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		page: integer("page").notNull().default(0),
		content: text("content").notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.docId, table.page] }),
	}),
)

export const embeddings = pgTable(
	"embeddings",
	{
		docId: text("doc_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		page: integer("page").notNull().default(0),
		chunk: integer("chunk").notNull().default(0),
		embedding: vector("embedding", { dimensions: 768 }).notNull(),
		metadata: jsonb("metadata"),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.docId, table.page, table.chunk] }),
	}),
)

export type Document = typeof documents.$inferSelect
export type InsertDocument = typeof documents.$inferInsert
export type DocChunk = typeof docChunks.$inferSelect
export type DocText = typeof docText.$inferSelect
export type EmbeddingRow = typeof embeddings.$inferSelect
