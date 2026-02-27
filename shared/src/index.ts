// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @gm-assistant/shared
 *
 * Shared type definitions for the GM Assistant API contract.
 * Used by both the frontend client and backend server.
 */

// Common types
export type { Id, ISOTimestamp, BaseEntity } from "./common.js";

// Entity types
export type {
  User,
  AuthUser,
  Session,
  Campaign,
  DocumentType,
  DocumentStatus,
  DocumentMetadata,
  Document,
  Chunk,
  NpcStatus,
  NpcImportance,
  Npc,
  GameSessionStatus,
  GameSession,
  Transcript,
  Conversation,
  MessageRole,
  ConversationMessage,
  ConversationWithMessages,
} from "./entities.js";

// Query / RAG types
export type {
  TokenUsage,
  AnswerSource,
  QuerySource,
  QueryFilters,
  ConversationHistoryMessage,
  QueryRequest,
  ConfidenceLevel,
  QueryResponse,
  RAGResult,
} from "./query.js";

// Generation types
export type {
  HookTone,
  GenerateHooksRequest,
  AdventureHook,
  GenerateHooksResponse,
  NpcTone,
  GenerateNpcsRequest,
  GeneratedNpc,
  GenerateNpcsResponse,
  GenerationStatusEvent,
  GenerationHookEvent,
  GenerationNpcEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
  GenerationSSEEvent,
  NpcGenerationSSEEvent,
} from "./generation.js";

// API request/response types
export type {
  ApiErrorResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignResponse,
  CampaignListResponse,
  DocumentListQuery,
  DocumentResponse,
  DocumentListResponse,
  DocumentDownloadResponse,
  CreateNpcRequest,
  UpdateNpcRequest,
  NpcListQuery,
  NpcResponse,
  NpcListResponse,
  ConversationListResponse,
  ConversationDetailResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  SupportedMimeType,
} from "./api.js";

// Runtime values
export { SUPPORTED_MIME_TYPES } from "./api.js";
