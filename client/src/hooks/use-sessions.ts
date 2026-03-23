// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  GameSessionListResponse,
  GameSessionResponse,
  TranscriptResponse,
  SessionSummaryResponse,
  SessionAudioResponse,
  UpdateSessionSummaryRequest,
  CreateMarkerRequest,
  UpdateMarkerRequest,
  MarkerResponse,
  MarkersResponse,
} from "@/types";

export const sessionKeys = {
  all: (campaignId: string) => ["sessions", campaignId] as const,
  detail: (campaignId: string, id: string) => ["sessions", campaignId, id] as const,
  transcript: (campaignId: string, id: string) =>
    ["sessions", campaignId, id, "transcript"] as const,
  summary: (campaignId: string, id: string) =>
    ["sessions", campaignId, id, "summary"] as const,
  audio: (campaignId: string, id: string) =>
    ["sessions", campaignId, id, "audio"] as const,
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

export function useSessionSummary(campaignId: string, sessionId: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.summary(campaignId, sessionId),
    queryFn: () =>
      api.get<SessionSummaryResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/summary`
      ),
    select: (data) => data.summary,
    enabled: !!campaignId && !!sessionId && enabled,
    retry: (failureCount, error) => {
      // Don't retry 404s (summary not generated yet)
      if (error instanceof Error && "statusCode" in error && (error as { statusCode: number }).statusCode === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const summary = query.state.data?.summary;
      return summary?.status === "generating" || summary?.status === "pending"
        ? PROCESSING_POLL_INTERVAL
        : false;
    },
  });
}

export function useGenerateSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, sessionId }: { campaignId: string; sessionId: string }) =>
      api.post<SessionSummaryResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/summary`,
        {}
      ),
    onSuccess: (_data, { campaignId, sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.summary(campaignId, sessionId),
      });
    },
  });
}

export function useUpdateSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      sessionId,
      data,
    }: {
      campaignId: string;
      sessionId: string;
      data: UpdateSessionSummaryRequest;
    }) =>
      api.patch<SessionSummaryResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/summary`,
        data
      ),
    onSuccess: (_data, { campaignId, sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.summary(campaignId, sessionId),
      });
    },
  });
}

export function useSessionAudioUrl(campaignId: string, sessionId: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.audio(campaignId, sessionId),
    queryFn: () =>
      api.get<SessionAudioResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/audio`
      ),
    enabled: !!campaignId && !!sessionId && enabled,
    staleTime: 30 * 60 * 1000, // 30 min — URL is valid for 1 hour
  });
}

export function useAddMarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      sessionId,
      data,
    }: {
      campaignId: string;
      sessionId: string;
      data: CreateMarkerRequest;
    }) =>
      api.post<MarkerResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/markers`,
        data
      ),
    onSuccess: (_data, { campaignId, sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.transcript(campaignId, sessionId),
      });
    },
  });
}

export function useUpdateMarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      sessionId,
      data,
    }: {
      campaignId: string;
      sessionId: string;
      data: UpdateMarkerRequest;
    }) =>
      api.patch<MarkersResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/markers`,
        data
      ),
    onSuccess: (_data, { campaignId, sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.transcript(campaignId, sessionId),
      });
    },
  });
}

export function useDeleteMarker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      campaignId,
      sessionId,
      time,
      label,
    }: {
      campaignId: string;
      sessionId: string;
      time: number;
      label: string;
    }) =>
      api.delete<MarkersResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/markers?time=${time}&label=${encodeURIComponent(label)}`
      ),
    onSuccess: (_data, { campaignId, sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.transcript(campaignId, sessionId),
      });
    },
  });
}
