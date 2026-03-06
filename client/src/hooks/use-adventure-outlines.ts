// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdventureOutlineEntity,
  AdventureOutlineListResponse,
  AdventureOutlineResponse,
  CreateAdventureOutlineRequest,
  UpdateAdventureOutlineRequest,
  AdventureOutlineListQuery,
} from "@/types";

export const adventureOutlineKeys = {
  all: (campaignId: string) => ["adventureOutlines", campaignId] as const,
  detail: (campaignId: string, id: string) => ["adventureOutlines", campaignId, id] as const,
};

export function useAdventureOutlines(campaignId: string, query?: AdventureOutlineListQuery) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  const url = `/api/campaigns/${campaignId}/adventure-outlines${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...adventureOutlineKeys.all(campaignId), query],
    queryFn: () => api.get<AdventureOutlineListResponse>(url),
    select: (data) => data.adventureOutlines,
    enabled: !!campaignId,
  });
}

export function useAdventureOutline(campaignId: string, id: string) {
  return useQuery({
    queryKey: adventureOutlineKeys.detail(campaignId, id),
    queryFn: () =>
      api.get<AdventureOutlineResponse>(`/api/campaigns/${campaignId}/adventure-outlines/${id}`),
    select: (data) => data.adventureOutline,
    enabled: !!campaignId && !!id,
  });
}

export function useCreateAdventureOutline(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAdventureOutlineRequest) =>
      api.post<AdventureOutlineResponse>(`/api/campaigns/${campaignId}/adventure-outlines`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adventureOutlineKeys.all(campaignId) });
    },
  });
}

export function useUpdateAdventureOutline(campaignId: string, id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAdventureOutlineRequest) =>
      api.patch<AdventureOutlineResponse>(
        `/api/campaigns/${campaignId}/adventure-outlines/${id}`,
        data
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adventureOutlineKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureOutlineKeys.all(campaignId) });
    },
  });
}

export function useDeleteAdventureOutline(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/adventure-outlines/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: adventureOutlineKeys.all(campaignId) });
      const previous = queryClient.getQueryData<AdventureOutlineListResponse>(
        adventureOutlineKeys.all(campaignId)
      );
      if (previous) {
        queryClient.setQueryData<AdventureOutlineListResponse>(
          adventureOutlineKeys.all(campaignId),
          {
            adventureOutlines: previous.adventureOutlines.filter(
              (o: AdventureOutlineEntity) => o.id !== id
            ),
          }
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adventureOutlineKeys.all(campaignId), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: adventureOutlineKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: adventureOutlineKeys.all(campaignId) });
    },
  });
}
