// SPDX-License-Identifier: AGPL-3.0-or-later

export { generationRoutes } from "./routes.js";

export { buildCampaignContentContext } from "./campaign-content.js";
export type { CampaignContentOptions, CampaignContentResult } from "./campaign-content.js";

export { generateAdventureHooks } from "./generators/index.js";
export { generateNpcs } from "./generators/index.js";
export { generateLocations } from "./generators/index.js";
export { generateAdventureOutlines } from "./generators/index.js";

export { buildAdventureHookPrompt } from "./prompts/index.js";
export { buildNpcPrompt } from "./prompts/index.js";
export { buildLocationPrompt } from "./prompts/index.js";
export { buildAdventureOutlinePrompt } from "./prompts/index.js";

export {
  generateHooksParamSchema,
  generateHooksBodySchema,
  type GenerateHooksParam,
  type GenerateHooksBody,
  generateNpcsParamSchema,
  generateNpcsBodySchema,
  type GenerateNpcsParam,
  type GenerateNpcsBody,
  generateLocationsParamSchema,
  generateLocationsBodySchema,
  type GenerateLocationsParam,
  type GenerateLocationsBody,
  generateOutlinesParamSchema,
  generateOutlinesBodySchema,
  type GenerateOutlinesParam,
  type GenerateOutlinesBody,
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
  LocationTone,
  LocationGenerationRequest,
  GeneratedLocation,
  LocationGenerationResult,
  LocationGenerationError,
  OutlineTone,
  AdventureOutlineRequest,
  GeneratedAdventureOutline,
  AdventureOutlineResult,
  AdventureOutlineError,
} from "./types.js";
