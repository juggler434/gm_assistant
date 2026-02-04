import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { documents } from "./documents.js";
import { campaigns } from "./campaigns.js";

// Embedding dimensions for nomic-embed-text model
export const EMBEDDING_DIMENSIONS = 768;

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),

    // Chunk content
    content: text("content").notNull(),

    // Vector embedding for similarity search (768 dimensions for nomic-embed-text)
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    // Chunk positioning
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),

    // Source location in document
    pageNumber: integer("page_number"),
    section: text("section"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Foreign key indexes for efficient joins and filtering
    index("chunks_document_id_idx").on(table.documentId),
    index("chunks_campaign_id_idx").on(table.campaignId),

    // HNSW index for fast vector similarity search using cosine distance
    index("chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
