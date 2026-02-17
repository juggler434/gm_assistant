// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { campaignRoutes } from "./routes.js";

// Schemas
export {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
  type CreateCampaignBody,
  type UpdateCampaignBody,
  type CampaignIdParam,
} from "./schemas.js";

// Repository
export {
  createCampaign,
  findCampaignsByUserId,
  findCampaignById,
  findCampaignByIdAndUserId,
  updateCampaign,
  deleteCampaign,
} from "./repository.js";
