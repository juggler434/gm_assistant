// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  GameSessionListResponse,
  GameSessionResponse,
  TranscriptResponse,
} from "@/types";

export const sessionKeys = {
  all: (campaignId: string) => ["sessions", campaignId] as const,
  detail: (campaignId: string, id: string) => ["sessions", campaignId, id] as const,
  transcript: (campaignId: string, id: string) =>
    ["sessions", campaignId, id, "transcript"] as const,
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

export function useSessionDetail(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.detail(campaignId, sessionId),
    queryFn: () =>
      api.get<GameSessionResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}`
      ),
    select: (data) => data.session,
    enabled: !!campaignId && !!sessionId,
    refetchInterval: (query) => {
      const session = query.state.data?.session;
      return session?.status === "processing" ? PROCESSING_POLL_INTERVAL : false;
    },
  });
}

export function useTranscript(campaignId: string, sessionId: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.transcript(campaignId, sessionId),
    queryFn: () =>
      api.get<TranscriptResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/transcript`
      ),
    select: (data) => data.transcript,
    enabled: !!campaignId && !!sessionId && enabled,
  });
}
