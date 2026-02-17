// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Campaign,
  CampaignListResponse,
  CampaignResponse,
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from "@/types";

export const campaignKeys = {
  all: ["campaigns"] as const,
  detail: (id: string) => ["campaigns", id] as const,
};

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.all,
    queryFn: () => api.get<CampaignListResponse>("/api/campaigns"),
    select: (data) => data.campaigns,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => api.get<CampaignResponse>(`/api/campaigns/${id}`),
    select: (data) => data.campaign,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCampaignRequest) => api.post<CampaignResponse>("/api/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

export function useUpdateCampaign(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCampaignRequest) =>
      api.patch<CampaignResponse>(`/api/campaigns/${id}`, data),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: campaignKeys.detail(id) });
      const previous = queryClient.getQueryData<CampaignResponse>(campaignKeys.detail(id));
      if (previous) {
        queryClient.setQueryData<CampaignResponse>(campaignKeys.detail(id), {
          campaign: { ...previous.campaign, ...updates },
        });
      }
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(campaignKeys.detail(id), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/campaigns/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: campaignKeys.all });
      const previous = queryClient.getQueryData<CampaignListResponse>(campaignKeys.all);
      if (previous) {
        queryClient.setQueryData<CampaignListResponse>(campaignKeys.all, {
          campaigns: previous.campaigns.filter((c: Campaign) => c.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(campaignKeys.all, context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: campaignKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
  });
}
