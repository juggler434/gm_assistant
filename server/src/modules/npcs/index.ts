// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { npcRoutes } from "./routes.js";

// Schemas
export {
  npcCampaignIdParamSchema,
  npcParamsSchema,
  createNpcSchema,
  updateNpcSchema,
  npcListQuerySchema,
  type NpcCampaignIdParam,
  type NpcParams,
  type CreateNpcBody,
  type UpdateNpcBody,
  type NpcListQuery,
} from "./schemas.js";

// Repository
export {
  createNpc,
  findNpcsByCampaignId,
  findNpcByIdAndCampaignId,
  updateNpc,
  deleteNpc,
} from "./repository.js";
