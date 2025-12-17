CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"rerank_min_score" double precision DEFAULT 0.75 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
