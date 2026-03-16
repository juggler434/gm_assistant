// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { GameSessionListResponse, GameSessionResponse } from "@/types";

export const sessionKeys = {
  all: (campaignId: string) => ["sessions", campaignId] as const,
  detail: (campaignId: string, id: string) => ["sessions", campaignId, id] as const,
};

const PROCESSING_POLL_INTERVAL = 3000;

function hasSessionsInProgress(data: GameSessionListResponse | undefined): boolean {
  if (!data) return false;
  return data.sessions.some((s) => s.status === "processing");
}

export function useSessions(campaignId: string) {
  return useQuery({
    queryKey: sessionKeys.all(campaignId),
    queryFn: () => api.get<GameSessionListResponse>(`/api/campaigns/${campaignId}/sessions`),
    select: (data) => data.sessions,
    enabled: !!campaignId,
    refetchInterval: (query) =>
      hasSessionsInProgress(query.state.data) ? PROCESSING_POLL_INTERVAL : false,
  });
}

interface UploadSessionParams {
  campaignId: string;
  file: File;
  title?: string;
  date?: string;
}

export function useUploadSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, file, title, date }: UploadSessionParams) => {
      const formData = new FormData();
      formData.append("file", file);
      if (title) formData.append("title", title);
      if (date) formData.append("date", date);
      return api.upload<GameSessionResponse>(`/api/campaigns/${campaignId}/sessions`, formData);
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(campaignId) });
    },
  });
}
