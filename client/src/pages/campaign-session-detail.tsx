// SPDX-License-Identifier: AGPL-3.0-or-later

import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  Mic,
  CheckCircle2,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { TranscriptViewer } from "@/components/sessions/transcript-viewer";
import { SessionSummarySection } from "@/components/sessions/session-summary";
import { useSessionDetail, useTranscript } from "@/hooks/use-sessions";
import type { GameSessionStatus } from "@/types";

const STATUS_CONFIG: Record<
  GameSessionStatus,
  { label: string; variant: "default" | "warning" | "success"; icon: typeof Mic }
> = {
  recording: { label: "Recording", variant: "default", icon: Mic },
  processing: { label: "Processing", variant: "warning", icon: Loader2 },
  ready: { label: "Ready", variant: "success", icon: CheckCircle2 },
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function SessionDetailPage() {
  const { id: campaignId, sessionId } = useParams<{
    id: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useSessionDetail(campaignId ?? "", sessionId ?? "");

  const isReady = session?.status === "ready";
  const {
    data: transcript,
    isLoading: transcriptLoading,
    error: transcriptError,
    refetch: refetchTranscript,
  } = useTranscript(campaignId ?? "", sessionId ?? "", isReady);

  if (sessionError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Button>
        <ErrorState
          heading="Failed to load session"
          description={sessionError.message}
          onRetry={() => refetchSession()}
        />
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!session) return null;

  const config = STATUS_CONFIG[session.status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 gap-1.5 text-muted-foreground"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Sessions
          </Button>
          <h2 className="text-xl font-semibold text-foreground">{session.title}</h2>
        </div>
        <Badge variant={config.variant} className="shrink-0">
          <StatusIcon
            className={`mr-1 h-3 w-3 ${session.status === "processing" ? "animate-spin" : ""}`}
          />
          {config.label}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="text-sm font-medium">{formatDate(session.date)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-medium">{formatDuration(session.duration)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Bookmark className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Markers</p>
              <p className="text-sm font-medium">
                {transcript?.markers.length ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Summary */}
      {isReady && campaignId && sessionId && (
        <SessionSummarySection
          campaignId={campaignId}
          sessionId={sessionId}
        />
      )}

      {/* Transcript */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          {session.status === "processing" && (
            <EmptyState
              icon={<Loader2 className="animate-spin" />}
              heading="Processing transcript"
              description="Your audio is being transcribed. This page will update automatically when ready."
            />
          )}

          {session.status === "recording" && (
            <EmptyState
              icon={<Mic />}
              heading="Session recording"
              description="The transcript will be available once the session is finished and processed."
            />
          )}

          {isReady && transcriptLoading && (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-12 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          )}

          {isReady && transcriptError && (
            <ErrorState
              heading="Failed to load transcript"
              description={transcriptError.message}
              onRetry={() => refetchTranscript()}
            />
          )}

          {isReady && transcript && transcript.segments.length > 0 && (
            <TranscriptViewer
              segments={transcript.segments}
              markers={transcript.markers}
            />
          )}

          {isReady && transcript && transcript.segments.length === 0 && (
            <EmptyState
              icon={<Mic />}
              heading="No transcript segments"
              description="The transcript was processed but no segments were found."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
