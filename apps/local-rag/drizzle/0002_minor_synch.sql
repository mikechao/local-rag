CREATE TABLE "chunk_embeddings" (
	"chunk_id" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_embeddings_chunk_id_embedding_model_pk" PRIMARY KEY("chunk_id","embedding_model")
);
--> statement-breakpoint
ALTER TABLE "embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "embeddings" CASCADE;--> statement-breakpoint
ALTER TABLE "doc_text" RENAME TO "document_chunks";--> statement-breakpoint
ALTER TABLE "document_chunks" RENAME COLUMN "doc_id" TO "document_id";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "doc_text_doc_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "doc_text_doc_id_page_pk";--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "id" text PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "doc_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "page_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "chunk_index" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "heading_path" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "embedded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_id_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_id_page_idx" ON "document_chunks" USING btree ("document_id","page_number");--> statement-breakpoint
CREATE INDEX "embedded_idx" ON "document_chunks" USING btree ("embedded");--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "page";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "content";