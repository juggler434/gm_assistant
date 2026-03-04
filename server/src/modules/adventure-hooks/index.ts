// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { adventureHookRoutes } from "./routes.js";

// Schemas
export {
  adventureHookCampaignIdParamSchema,
  adventureHookParamsSchema,
  createAdventureHookSchema,
  updateAdventureHookSchema,
  adventureHookListQuerySchema,
  type AdventureHookCampaignIdParam,
  type AdventureHookParams,
  type CreateAdventureHookBody,
  type UpdateAdventureHookBody,
  type AdventureHookListQuery,
} from "./schemas.js";

// Repository
export {
  createAdventureHook,
  findAdventureHooksByCampaignId,
  findAdventureHookByIdAndCampaignId,
  updateAdventureHook,
  deleteAdventureHook,
} from "./repository.js";
