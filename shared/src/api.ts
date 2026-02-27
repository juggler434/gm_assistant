// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * API request/response types for all endpoints.
 * Matches the actual shapes sent and received over the wire.
 */

import type {
  AuthUser,
  Campaign,
  Conversation,
  ConversationWithMessages,
  Document,
  DocumentType,
  DocumentStatus,
  Npc,
  NpcStatus,
  NpcImportance,
} from "./entities.js";

// ============================================================================
// Shared API Error Response
// ============================================================================

/** Standard error response shape used by all endpoints */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

// ============================================================================
// Auth API
// ============================================================================

/** POST /api/auth/register - request body */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

/** POST /api/auth/login - request body */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Response from register and login endpoints */
export interface AuthResponse {
  user: AuthUser;
}

// ============================================================================
// Campaign API
// ============================================================================

/** POST /api/campaigns - request body */
export interface CreateCampaignRequest {
  name: string;
  description?: string | null;
}

/** PATCH /api/campaigns/:id - request body */
export interface UpdateCampaignRequest {
  name?: string;
  description?: string | null;
}

/** Response wrapping a single campaign */
export interface CampaignResponse {
  campaign: Campaign;
}

/** Response wrapping a list of campaigns */
export interface CampaignListResponse {
  campaigns: Campaign[];
}

// ============================================================================
// Document API
// ============================================================================

/** Query parameters for GET /api/campaigns/:campaignId/documents */
export interface DocumentListQuery {
  status?: DocumentStatus;
  documentType?: DocumentType;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single document */
export interface DocumentResponse {
  document: Document;
}

/** Response wrapping a list of documents */
export interface DocumentListResponse {
  documents: Document[];
}

/** Response from GET /api/campaigns/:campaignId/documents/:id/download */
export interface DocumentDownloadResponse {
  url: string;
  expiresAt: string;
}

// ============================================================================
// Conversation API
// ============================================================================

/** Response wrapping a list of conversations */
export interface ConversationListResponse {
  conversations: Conversation[];
}

/** Response wrapping a single conversation with messages */
export interface ConversationDetailResponse {
  conversation: ConversationWithMessages;
}

/** POST /api/campaigns/:campaignId/conversations - request body */
export interface CreateConversationRequest {
  title: string;
}

/** Response wrapping a newly created conversation */
export interface CreateConversationResponse {
  conversation: Conversation;
}

// ============================================================================
// NPC API
// ============================================================================

/** POST /api/campaigns/:campaignId/npcs - request body */
export interface CreateNpcRequest {
  name: string;
  race?: string | null;
  classRole?: string | null;
  level?: string | null;
  appearance?: string | null;
  personality?: string | null;
  motivations?: string | null;
  secrets?: string | null;
  backstory?: string | null;
  statBlock?: Record<string, unknown> | null;
  importance?: NpcImportance;
  status?: NpcStatus;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** PATCH /api/campaigns/:campaignId/npcs/:id - request body */
export interface UpdateNpcRequest {
  name?: string;
  race?: string | null;
  classRole?: string | null;
  level?: string | null;
  appearance?: string | null;
  personality?: string | null;
  motivations?: string | null;
  secrets?: string | null;
  backstory?: string | null;
  statBlock?: Record<string, unknown> | null;
  importance?: NpcImportance;
  status?: NpcStatus;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** Query parameters for GET /api/campaigns/:campaignId/npcs */
export interface NpcListQuery {
  search?: string;
  status?: NpcStatus;
  importance?: NpcImportance;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single NPC */
export interface NpcResponse {
  npc: Npc;
}

/** Response wrapping a list of NPCs */
export interface NpcListResponse {
  npcs: Npc[];
}

// ============================================================================
// Supported File Types
// ============================================================================

/** MIME types accepted for document upload */
export type SupportedMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/markdown"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "image/png"
  | "image/jpeg"
  | "image/webp";

/** Mapping of MIME types to file extensions */
export const SUPPORTED_MIME_TYPES: Record<SupportedMimeType, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
