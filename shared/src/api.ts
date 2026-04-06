// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * API request/response types for all endpoints.
 * Matches the actual shapes sent and received over the wire.
 */

import type {
  AdventureEntity,
  AdventureHookEntity,
  AdventureOutlineEntity,
  AuthUser,
  Campaign,
  Conversation,
  ConversationWithMessages,
  Document,
  DocumentType,
  DocumentStatus,
  GameSession,
  GameSessionStatus,
  Location,
  Npc,
  NpcStatus,
  NpcImportance,
  SessionSummary,
  SummaryStatus,
  Transcript,
} from "./entities.js";
import type { AdventureFront, AdventureNode, AdventureScene, TimelineEntry } from "./generation.js";

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

/** Response from GET /api/campaigns/:id/stats */
export interface CampaignStatsResponse {
  stats: {
    documentCount: number;
    totalSizeBytes: number;
    chunkCount: number;
    documentsByStatus: Record<string, number>;
  };
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

/** PATCH /api/campaigns/:campaignId/documents/:id - request body */
export interface UpdateDocumentRequest {
  name?: string;
  documentType?: DocumentType;
  tags?: string[] | null;
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
// Location API
// ============================================================================

/** POST /api/campaigns/:campaignId/locations - request body */
export interface CreateLocationRequest {
  name: string;
  terrain?: string | null;
  climate?: string | null;
  size?: string | null;
  readAloud?: string | null;
  keyFeatures?: string[] | null;
  pointsOfInterest?: string[] | null;
  encounters?: string[] | null;
  secrets?: string[] | null;
  npcsPresent?: string[] | null;
  factions?: string[] | null;
  sensoryDetails?: { sights?: string; sounds?: string; smells?: string } | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** PATCH /api/campaigns/:campaignId/locations/:id - request body */
export interface UpdateLocationRequest {
  name?: string;
  terrain?: string | null;
  climate?: string | null;
  size?: string | null;
  readAloud?: string | null;
  keyFeatures?: string[] | null;
  pointsOfInterest?: string[] | null;
  encounters?: string[] | null;
  secrets?: string[] | null;
  npcsPresent?: string[] | null;
  factions?: string[] | null;
  sensoryDetails?: { sights?: string; sounds?: string; smells?: string } | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** Query parameters for GET /api/campaigns/:campaignId/locations */
export interface LocationListQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single location */
export interface LocationResponse {
  location: Location;
}

/** Response wrapping a list of locations */
export interface LocationListResponse {
  locations: Location[];
}

// ============================================================================
// Adventure Hook API
// ============================================================================

/** POST /api/campaigns/:campaignId/adventure-hooks - request body */
export interface CreateAdventureHookRequest {
  title: string;
  description: string;
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** PATCH /api/campaigns/:campaignId/adventure-hooks/:id - request body */
export interface UpdateAdventureHookRequest {
  title?: string;
  description?: string;
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** Query parameters for GET /api/campaigns/:campaignId/adventure-hooks */
export interface AdventureHookListQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single adventure hook */
export interface AdventureHookResponse {
  adventureHook: AdventureHookEntity;
}

/** Response wrapping a list of adventure hooks */
export interface AdventureHookListResponse {
  adventureHooks: AdventureHookEntity[];
}

// ============================================================================
// Adventure Outline API
// ============================================================================

/** POST /api/campaigns/:campaignId/adventure-outlines - request body */
export interface CreateAdventureOutlineRequest {
  title: string;
  description: string;
  acts: { title: string; description: string; keyEvents: string[]; encounters: string[] }[];
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** PATCH /api/campaigns/:campaignId/adventure-outlines/:id - request body */
export interface UpdateAdventureOutlineRequest {
  title?: string;
  description?: string;
  acts?: { title: string; description: string; keyEvents: string[]; encounters: string[] }[];
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** Query parameters for GET /api/campaigns/:campaignId/adventure-outlines */
export interface AdventureOutlineListQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single adventure outline */
export interface AdventureOutlineResponse {
  adventureOutline: AdventureOutlineEntity;
}

/** Response wrapping a list of adventure outlines */
export interface AdventureOutlineListResponse {
  adventureOutlines: AdventureOutlineEntity[];
}

// ============================================================================
// Adventure (Full) API
// ============================================================================

/** POST /api/campaigns/:campaignId/adventures - request body */
export interface CreateAdventureRequest {
  title: string;
  synopsis: string;
  estimatedDuration?: string | null;
  /** Legacy linear scenes (required for linear format) */
  scenes?: AdventureScene[];
  /** "linear" or "node-based" (defaults to "linear" for backward compat) */
  adventureFormat?: "linear" | "node-based";
  /** The evolving situation (required for node-based format) */
  front?: AdventureFront | null;
  /** Web of interconnected nodes (required for node-based format) */
  nodes?: AdventureNode[] | null;
  /** Doom timeline stages (required for node-based format) */
  doomTimeline?: TimelineEntry[] | null;
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  sourceOutlineId?: string | null;
  notes?: string | null;
}

/** PATCH /api/campaigns/:campaignId/adventures/:id - request body */
export interface UpdateAdventureRequest {
  title?: string;
  synopsis?: string;
  estimatedDuration?: string | null;
  scenes?: AdventureScene[];
  adventureFormat?: "linear" | "node-based";
  front?: AdventureFront | null;
  nodes?: AdventureNode[] | null;
  doomTimeline?: TimelineEntry[] | null;
  npcs?: string[] | null;
  locations?: string[] | null;
  factions?: string[] | null;
  tags?: string[] | null;
  isGenerated?: boolean;
  notes?: string | null;
}

/** Query parameters for GET /api/campaigns/:campaignId/adventures */
export interface AdventureListQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single adventure */
export interface AdventureResponse {
  adventure: AdventureEntity;
}

/** Response wrapping a list of adventures */
export interface AdventureListResponse {
  adventures: AdventureEntity[];
}

// ============================================================================
// Game Session API
// ============================================================================

/** Query parameters for GET /api/campaigns/:campaignId/sessions */
export interface GameSessionListQuery {
  status?: GameSessionStatus;
  limit?: number;
  offset?: number;
}

/** Response wrapping a single game session */
export interface GameSessionResponse {
  session: GameSession;
}

/** Response wrapping a list of game sessions */
export interface GameSessionListResponse {
  sessions: GameSession[];
}

/** Response wrapping a session transcript */
export interface TranscriptResponse {
  transcript: Transcript;
}

/** Response wrapping a session summary */
export interface SessionSummaryResponse {
  summary: SessionSummary;
}

/** Response from GET /api/campaigns/:campaignId/sessions/:id/audio */
export interface SessionAudioResponse {
  url: string;
  expiresAt: string;
}

/** PATCH /api/campaigns/:campaignId/sessions/:id/summary - request body */
export interface UpdateSessionSummaryRequest {
  content?: string;
  keyEvents?: string[];
  npcsEncountered?: string[];
  locationsVisited?: string[];
  itemsAcquired?: string[];
  openQuestions?: string[];
}

/** POST /api/campaigns/:campaignId/sessions/:id/markers - request body */
export interface CreateMarkerRequest {
  label: string;
  time: number;
  type?: string;
  notes?: string;
}

/** PATCH /api/campaigns/:campaignId/sessions/:id/markers - request body */
export interface UpdateMarkerRequest {
  /** Original time to identify the marker */
  originalTime: number;
  /** Original label to identify the marker */
  originalLabel: string;
  /** Updated fields */
  label?: string;
  time?: number;
  type?: string;
  notes?: string | null;
}

/** Response wrapping a single marker */
export interface MarkerResponse {
  marker: import("./entities.js").TranscriptMarker;
}

/** Response wrapping all markers for a session */
export interface MarkersResponse {
  markers: import("./entities.js").TranscriptMarker[];
}

/** A marker with surrounding transcript context */
export interface MarkerWithContext {
  marker: import("./entities.js").TranscriptMarker;
  segments: import("./entities.js").TranscriptSegment[];
}

/** GET /api/campaigns/:campaignId/sessions/:id/markers?context=true response */
export interface MarkersWithContextResponse {
  markers: MarkerWithContext[];
}

/** MIME types accepted for audio upload */
export type SupportedAudioMimeType =
  | "audio/mpeg"
  | "audio/wav"
  | "audio/wave"
  | "audio/x-wav"
  | "audio/mp4"
  | "audio/x-m4a";

/** Mapping of audio MIME types to file extensions */
export const SUPPORTED_AUDIO_MIME_TYPES: Record<SupportedAudioMimeType, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
} as const;

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
