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
  GenerationStatusEvent,
  GenerationHookEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
  GenerationSSEEvent,
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
  ConversationListResponse,
  ConversationDetailResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  SupportedMimeType,
} from "./api.js";

// Runtime values
export { SUPPORTED_MIME_TYPES } from "./api.js";
