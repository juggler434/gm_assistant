// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdventureHookEntity,
  AdventureHookListResponse,
  AdventureHookResponse,
  CreateAdventureHookRequest,
  UpdateAdventureHookRequest,
  AdventureHookListQuery,
} from "@/types";

export const adventureHookKeys = {
  all: (campaignId: string) => ["adventureHooks", campaignId] as const,
  detail: (campaignId: string, id: string) => ["adventureHooks", campaignId, id] as const,
};

export function useAdventureHooks(campaignId: string, query?: AdventureHookListQuery) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  const url = `/api/campaigns/${campaignId}/adventure-hooks${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...adventureHookKeys.all(campaignId), query],
    queryFn: () => api.get<AdventureHookListResponse>(url),
    select: (data) => data.adventureHooks,
    enabled: !!campaignId,
  });
}

export function useAdventureHook(campaignId: string, id: string) {
  return useQuery({
    queryKey: adventureHookKeys.detail(campaignId, id),
    queryFn: () =>
      api.get<AdventureHookResponse>(`/api/campaigns/${campaignId}/adventure-hooks/${id}`),
    select: (data) => data.adventureHook,
    enabled: !!campaignId && !!id,
  });
}

export function useCreateAdventureHook(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAdventureHookRequest) =>
      api.post<AdventureHookResponse>(`/api/campaigns/${campaignId}/adventure-hooks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adventureHookKeys.all(campaignId) });
    },
  });
}

export function useUpdateAdventureHook(campaignId: string, id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAdventureHookRequest) =>
      api.patch<AdventureHookResponse>(
        `/api/campaigns/${campaignId}/adventure-hooks/${id}`,
        data
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adventureHookKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureHookKeys.all(campaignId) });
    },
  });
}

export function useDeleteAdventureHook(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/adventure-hooks/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: adventureHookKeys.all(campaignId) });
      const previous = queryClient.getQueryData<AdventureHookListResponse>(
        adventureHookKeys.all(campaignId)
      );
      if (previous) {
        queryClient.setQueryData<AdventureHookListResponse>(
          adventureHookKeys.all(campaignId),
          {
            adventureHooks: previous.adventureHooks.filter(
              (h: AdventureHookEntity) => h.id !== id
            ),
          }
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adventureHookKeys.all(campaignId), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: adventureHookKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureHookKeys.all(campaignId) });
    },
  });
}
