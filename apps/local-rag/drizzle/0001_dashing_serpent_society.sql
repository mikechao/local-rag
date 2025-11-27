create extension if not exists lo;--> statement-breakpoint
DROP TABLE "doc_chunks" CASCADE;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "blob_oid" "oid" NOT NULL;--> statement-breakpoint
create trigger "documents_lo_gc"
	after update or delete on "documents"
	for each row execute function lo_manage('blob_oid');
