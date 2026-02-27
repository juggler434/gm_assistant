// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Npc,
  NpcListResponse,
  NpcResponse,
  CreateNpcRequest,
  UpdateNpcRequest,
  NpcListQuery,
} from "@/types";

export const npcKeys = {
  all: (campaignId: string) => ["npcs", campaignId] as const,
  detail: (campaignId: string, id: string) => ["npcs", campaignId, id] as const,
};

export function useNpcs(campaignId: string, query?: NpcListQuery) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.status) params.set("status", query.status);
  if (query?.importance) params.set("importance", query.importance);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  const url = `/api/campaigns/${campaignId}/npcs${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...npcKeys.all(campaignId), query],
    queryFn: () => api.get<NpcListResponse>(url),
    select: (data) => data.npcs,
    enabled: !!campaignId,
  });
}

export function useNpc(campaignId: string, id: string) {
  return useQuery({
    queryKey: npcKeys.detail(campaignId, id),
    queryFn: () =>
      api.get<NpcResponse>(`/api/campaigns/${campaignId}/npcs/${id}`),
    select: (data) => data.npc,
    enabled: !!campaignId && !!id,
  });
}

export function useCreateNpc(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateNpcRequest) =>
      api.post<NpcResponse>(`/api/campaigns/${campaignId}/npcs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: npcKeys.all(campaignId) });
    },
  });
}

export function useUpdateNpc(campaignId: string, id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateNpcRequest) =>
      api.patch<NpcResponse>(`/api/campaigns/${campaignId}/npcs/${id}`, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: npcKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: npcKeys.all(campaignId) });
    },
  });
}

export function useDeleteNpc(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/npcs/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: npcKeys.all(campaignId) });
      const previous = queryClient.getQueryData<NpcListResponse>(npcKeys.all(campaignId));
      if (previous) {
        queryClient.setQueryData<NpcListResponse>(npcKeys.all(campaignId), {
          npcs: previous.npcs.filter((n: Npc) => n.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(npcKeys.all(campaignId), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: npcKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: npcKeys.all(campaignId) });
    },
  });
}
