// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { adventureOutlineRoutes } from "./routes.js";

// Schemas
export {
  adventureOutlineCampaignIdParamSchema,
  adventureOutlineParamsSchema,
  createAdventureOutlineSchema,
  updateAdventureOutlineSchema,
  adventureOutlineListQuerySchema,
  type AdventureOutlineCampaignIdParam,
  type AdventureOutlineParams,
  type CreateAdventureOutlineBody,
  type UpdateAdventureOutlineBody,
  type AdventureOutlineListQuery,
} from "./schemas.js";

// Repository
export {
  createAdventureOutline,
  findAdventureOutlinesByCampaignId,
  findAdventureOutlineByIdAndCampaignId,
  updateAdventureOutline,
  deleteAdventureOutline,
} from "./repository.js";
