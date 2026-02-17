// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { QueryRequest, QueryResponse } from "@/types";

interface CampaignQueryParams extends QueryRequest {
  campaignId: string;
}

export function useCampaignQuery() {
  return useMutation({
    mutationFn: ({ campaignId, ...body }: CampaignQueryParams) =>
      api.post<QueryResponse>(`/api/campaigns/${campaignId}/query`, body),
  });
}
