CREATE TABLE "doc_chunks" (
	"doc_id" text NOT NULL,
	"chunk_no" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "doc_chunks_doc_id_chunk_no_pk" PRIMARY KEY("doc_id","chunk_no")
);
--> statement-breakpoint
CREATE TABLE "doc_text" (
	"doc_id" text NOT NULL,
	"page" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "doc_text_doc_id_page_pk" PRIMARY KEY("doc_id","page")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"doc_id" text NOT NULL,
	"page" integer DEFAULT 0 NOT NULL,
	"chunk" integer DEFAULT 0 NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "embeddings_doc_id_page_chunk_pk" PRIMARY KEY("doc_id","page","chunk")
);
--> statement-breakpoint
ALTER TABLE "doc_chunks" ADD CONSTRAINT "doc_chunks_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_text" ADD CONSTRAINT "doc_text_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;