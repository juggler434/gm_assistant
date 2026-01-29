/**
 * LLM Service Types
 */

/** Role for chat messages */
export type MessageRole = "system" | "user" | "assistant";

/** A single message in a chat conversation */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Options that can be passed to generation requests */
export interface GenerateOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0-2) */
  temperature?: number;
  /** Stop sequences */
  stop?: string[];
  /** Request timeout in milliseconds */
  timeout?: number;
}

/** Request for text generation (completion) */
export interface GenerateRequest extends GenerateOptions {
  /** The prompt to complete */
  prompt: string;
  /** Optional system prompt */
  system?: string;
}

/** Response from text generation */
export interface GenerateResponse {
  /** The generated text */
  text: string;
  /** Token usage statistics */
  usage?: TokenUsage | undefined;
  /** Model that generated the response */
  model: string;
  /** Generation duration in milliseconds */
  durationMs?: number | undefined;
}

/** Request for chat completion */
export interface ChatRequest extends GenerateOptions {
  /** The conversation messages */
  messages: ChatMessage[];
}

/** Response from chat completion */
export interface ChatResponse {
  /** The assistant's response message */
  message: ChatMessage;
  /** Token usage statistics */
  usage?: TokenUsage | undefined;
  /** Model that generated the response */
  model: string;
  /** Generation duration in milliseconds */
  durationMs?: number | undefined;
}

/** A chunk of streamed output */
export interface StreamChunk {
  /** The text content of this chunk */
  text: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Token usage (only present on final chunk) */
  usage?: TokenUsage | undefined;
}

/** LLM provider configuration */
export interface LLMConfig {
  /** Model identifier */
  model: string;
  /** Base URL for the LLM API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Default max tokens */
  maxTokens: number;
  /** Default temperature */
  temperature: number;
}
