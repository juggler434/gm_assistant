export { generationRoutes } from "./routes.js";

export { generateAdventureHooks } from "./generators/index.js";

export { buildAdventureHookPrompt } from "./prompts/index.js";

export {
  generateHooksParamSchema,
  generateHooksBodySchema,
  type GenerateHooksParam,
  type GenerateHooksBody,
} from "./schemas.js";

export type {
  HookTone,
  AdventureHookRequest,
  AdventureHook,
  AdventureHookResult,
  AdventureHookError,
} from "./types.js";
