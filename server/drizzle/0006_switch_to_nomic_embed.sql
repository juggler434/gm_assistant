-- Switch embedding model from mxbai-embed-large (1024-dim) to nomic-embed-text (768-dim).
-- Existing 1024-dim embeddings are incompatible, so all chunks must be deleted
-- and documents reset to pending for re-indexing.

-- Drop the existing HNSW index (references old vector dimensions)
DROP INDEX IF EXISTS "chunks_embedding_idx";--> statement-breakpoint
-- Delete all existing chunks (1024-dim embeddings are incompatible with 768-dim)
DELETE FROM "chunks";--> statement-breakpoint
-- Alter the embedding column from vector(1024) to vector(768)
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(768);--> statement-breakpoint
-- Recreate the HNSW index with the new dimensions
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- Reset all ready/error documents to pending so the worker re-indexes them
UPDATE "documents" SET "status" = 'pending', "chunk_count" = 0 WHERE "status" IN ('ready', 'error');
