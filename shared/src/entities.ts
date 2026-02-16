/**
 * Database entity types matching backend Drizzle schema definitions.
 *
 * These types represent the shapes returned by the API, not the full
 * database row types (e.g. passwordHash is excluded from User).
 */

import type { Id, ISOTimestamp, BaseEntity } from "./common.js";

// ============================================================================
// User
// ============================================================================

/** User entity as returned by the API (excludes passwordHash) */
export interface User {
  id: Id;
  email: string;
  name: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/** Minimal user info returned in auth responses */
export interface AuthUser {
  id: Id;
  email: string;
  name: string;
}

// ============================================================================
// Session
// ============================================================================

/** Validated session information */
export interface Session {
  id: string;
  userId: Id;
  createdAt: ISOTimestamp;
  lastVerifiedAt: ISOTimestamp;
}

// ============================================================================
// Campaign
// ============================================================================

/** Campaign entity matching server/src/db/schema/campaigns.ts */
export interface Campaign extends BaseEntity {
  userId: Id;
  name: string;
  description: string | null;
}

// ============================================================================
// Document
// ============================================================================

/** Supported document types matching server documentTypeEnum */
export type DocumentType = "rulebook" | "setting" | "notes" | "map" | "image";

/** Document processing status matching server documentStatusEnum */
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

/** Flexible metadata stored as JSONB on document records */
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

/** Document entity matching server/src/db/schema/documents.ts */
export interface Document extends BaseEntity {
  campaignId: Id;
  uploadedBy: Id;
  name: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  documentType: DocumentType;
  tags: string[] | null;
  metadata: DocumentMetadata | null;
  status: DocumentStatus;
  processingError: string | null;
  chunkCount: number | null;
}

// ============================================================================
// Chunk
// ============================================================================

/** Text chunk with vector embedding, matching server/src/db/schema/chunks.ts */
export interface Chunk {
  id: Id;
  documentId: Id;
  campaignId: Id;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  pageNumber: number | null;
  section: string | null;
  createdAt: ISOTimestamp;
}

// ============================================================================
// Game Session & Transcript (planned features)
// ============================================================================

/** Status of a game session */
export type GameSessionStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";

/** A game session within a campaign */
export interface GameSession extends BaseEntity {
  campaignId: Id;
  title: string;
  description: string | null;
  sessionNumber: number;
  scheduledAt: ISOTimestamp | null;
  startedAt: ISOTimestamp | null;
  endedAt: ISOTimestamp | null;
  status: GameSessionStatus;
  summary: string | null;
}

/** A transcript entry within a game session */
export interface Transcript {
  id: Id;
  gameSessionId: Id;
  speaker: string;
  content: string;
  timestamp: ISOTimestamp;
  type: "narration" | "dialogue" | "action" | "ooc" | "system";
}

// ============================================================================
// Conversation
// ============================================================================

/** A conversation within a campaign's AI query interface */
export interface Conversation {
  id: Id;
  campaignId: Id;
  userId: Id;
  title: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/** Role of a message in a conversation */
export type MessageRole = "user" | "assistant";

/** A single message within a conversation */
export interface ConversationMessage {
  id: Id;
  conversationId: Id;
  role: MessageRole;
  content: string;
  sources: import("./query.js").AnswerSource[] | null;
  confidence: import("./query.js").ConfidenceLevel | null;
  createdAt: ISOTimestamp;
}

/** A conversation with its messages included */
export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}
