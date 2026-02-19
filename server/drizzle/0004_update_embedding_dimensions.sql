-- Drop the existing HNSW index (it references the old vector dimensions)
DROP INDEX IF EXISTS "chunks_embedding_idx";--> statement-breakpoint
-- Alter the embedding column from vector(768) to vector(1024)
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(1024);--> statement-breakpoint
-- Recreate the HNSW index with the new dimensions
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
