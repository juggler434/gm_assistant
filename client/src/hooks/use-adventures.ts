// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdventureEntity,
  AdventureListResponse,
  AdventureResponse,
  CreateAdventureRequest,
  UpdateAdventureRequest,
  AdventureListQuery,
} from "@/types";

export const adventureKeys = {
  all: (campaignId: string) => ["adventures", campaignId] as const,
  detail: (campaignId: string, id: string) => ["adventures", campaignId, id] as const,
};

export function useAdventures(campaignId: string, query?: AdventureListQuery) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  const url = `/api/campaigns/${campaignId}/adventures${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...adventureKeys.all(campaignId), query],
    queryFn: () => api.get<AdventureListResponse>(url),
    select: (data) => data.adventures,
    enabled: !!campaignId,
  });
}

export function useAdventure(campaignId: string, id: string) {
  return useQuery({
    queryKey: adventureKeys.detail(campaignId, id),
    queryFn: () =>
      api.get<AdventureResponse>(`/api/campaigns/${campaignId}/adventures/${id}`),
    select: (data) => data.adventure,
    enabled: !!campaignId && !!id,
  });
}

export function useCreateAdventure(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAdventureRequest) =>
      api.post<AdventureResponse>(`/api/campaigns/${campaignId}/adventures`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adventureKeys.all(campaignId) });
    },
  });
}

export function useUpdateAdventure(campaignId: string, id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAdventureRequest) =>
      api.patch<AdventureResponse>(
        `/api/campaigns/${campaignId}/adventures/${id}`,
        data
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adventureKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureKeys.all(campaignId) });
    },
  });
}

export function useDeleteAdventure(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/adventures/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: adventureKeys.all(campaignId) });
      const previous = queryClient.getQueryData<AdventureListResponse>(
        adventureKeys.all(campaignId)
      );
      if (previous) {
        queryClient.setQueryData<AdventureListResponse>(
          adventureKeys.all(campaignId),
          {
            adventures: previous.adventures.filter(
              (a: AdventureEntity) => a.id !== id
            ),
          }
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adventureKeys.all(campaignId), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: adventureKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureKeys.all(campaignId) });
    },
  });
}
