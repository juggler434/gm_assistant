// SPDX-License-Identifier: AGPL-3.0-or-later

export {
  executeRAGPipeline,
} from "./service.js";

export {
  buildContext,
  estimateTokens,
} from "./context-builder.js";

export {
  generateResponse,
  computeConfidence,
} from "./response-generator.js";

export type {
  RAGQuery,
  RAGResult,
  RAGError,
  BuiltContext,
  SourceCitation,
  ContextBuilderOptions,
  GeneratedAnswer,
  AnswerSource,
  ResponseGeneratorError,
} from "./types.js";
