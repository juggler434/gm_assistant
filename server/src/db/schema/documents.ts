import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { campaigns } from "./campaigns.js";

// Enum for document types
export const documentTypeEnum = pgEnum("document_type", [
  "rulebook",
  "setting",
  "notes",
  "map",
  "image",
]);

// Enum for document processing status
export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

// TypeScript interfaces for metadata
export interface DocumentMetadata {
  // Common metadata
  description?: string;
  author?: string;
  version?: string;
  pageCount?: number;

  // Image-specific metadata
  width?: number;
  height?: number;
  format?: string;

  // Map-specific metadata
  gridSize?: number;
  scale?: string;

  // Rulebook/setting metadata
  system?: string;
  edition?: string;

  // Processing metadata
  extractedText?: boolean;
  embeddingsGenerated?: boolean;

  // Allow additional custom metadata
  [key: string]: unknown;
}

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // File identification
    name: varchar("name", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    fileSize: integer("file_size").notNull(),

    // Storage location
    storagePath: varchar("storage_path", { length: 1024 }).notNull(),

    // Document classification
    documentType: documentTypeEnum("document_type").notNull(),
    tags: text("tags").array().default([]),
    metadata: jsonb("metadata").$type<DocumentMetadata>().default({}),

    // Processing status
    status: documentStatusEnum("status").notNull().default("pending"),
    processingError: text("processing_error"),
    chunkCount: integer("chunk_count"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("documents_campaign_id_idx").on(table.campaignId),
    index("documents_status_idx").on(table.status),
    index("documents_document_type_idx").on(table.documentType),
    index("documents_uploaded_by_idx").on(table.uploadedBy),
  ]
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];
