// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { locationRoutes } from "./routes.js";

// Schemas
export {
  locationCampaignIdParamSchema,
  locationParamsSchema,
  createLocationSchema,
  updateLocationSchema,
  locationListQuerySchema,
  type LocationCampaignIdParam,
  type LocationParams,
  type CreateLocationBody,
  type UpdateLocationBody,
  type LocationListQuery,
} from "./schemas.js";

// Repository
export {
  createLocation,
  findLocationsByCampaignId,
  findLocationByIdAndCampaignId,
  updateLocation,
  deleteLocation,
} from "./repository.js";
