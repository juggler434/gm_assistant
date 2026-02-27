// SPDX-License-Identifier: AGPL-3.0-or-later

export { generationRoutes } from "./routes.js";

export { generateAdventureHooks } from "./generators/index.js";
export { generateNpcs } from "./generators/index.js";

export { buildAdventureHookPrompt } from "./prompts/index.js";
export { buildNpcPrompt } from "./prompts/index.js";

export {
  generateHooksParamSchema,
  generateHooksBodySchema,
  type GenerateHooksParam,
  type GenerateHooksBody,
  generateNpcsParamSchema,
  generateNpcsBodySchema,
  type GenerateNpcsParam,
  type GenerateNpcsBody,
} from "./schemas.js";

export type {
  HookTone,
  AdventureHookRequest,
  AdventureHook,
  AdventureHookResult,
  AdventureHookError,
  NpcTone,
  NpcGenerationRequest,
  GeneratedNpc,
  NpcGenerationResult,
  NpcGenerationError,
} from "./types.js";
