// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic,
  Square,
  Pause,
  Play,
  Bookmark,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLiveSession } from "@/hooks/use-live-session";

interface RecordSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

const MARKER_TYPE_COLORS: Record<string, string> = {
  combat: "bg-red-500/20 text-red-400 border-red-500/30",
  roleplay: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  loot: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  important: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function getMarkerColor(type: string): string {
  return MARKER_TYPE_COLORS[type] ?? "bg-primary/20 text-primary border-primary/30";
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RecordSessionDialog({
  open,
  onOpenChange,
  campaignId,
}: RecordSessionDialogProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const markerCountRef = useRef(0);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const session = useLiveSession({ campaignId });

  const isActive =
    session.state === "connecting" ||
    session.state === "recording" ||
    session.state === "paused" ||
    session.state === "stopping";

  // Auto-scroll transcript
  useEffect(() => {
    if (autoScrollRef.current && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [session.transcript]);

  const handleTranscriptScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      autoScrollRef.current = isAtBottom;
    },
    []
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && isActive) {
        // Prevent accidental close during recording
        return;
      }
      if (!next) {
        session.reset();
        setTitle("");
        markerCountRef.current = 0;
      }
      onOpenChange(next);
    },
    [isActive, session, onOpenChange]
  );

  const handleStart = useCallback(() => {
    session.startRecording(
      title || `Session ${new Date().toLocaleDateString()}`
    );
  }, [session, title]);

  const handleStop = useCallback(() => {
    session.stopRecording();
  }, [session]);

  const handleAddMarker = useCallback(() => {
    markerCountRef.current += 1;
    session.addMarker(`Marker ${markerCountRef.current}`);
  }, [session]);

  const handleViewSession = useCallback(() => {
    if (session.sessionId) {
      onOpenChange(false);
      navigate(session.sessionId);
    }
  }, [session.sessionId, navigate, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-md",
          isActive && "sm:max-w-lg"
        )}
        onInteractOutside={(e: Event) => {
          if (isActive) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Record Session
          </DialogTitle>
        </DialogHeader>

        {/* Pre-recording state */}
        {session.state === "idle" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="record-title">Title (optional)</Label>
              <Input
                id="record-title"
                placeholder="e.g. Session 12 — Descent into Avernus"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStart();
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your browser will request microphone access. Audio is streamed to
              the server for real-time transcription.
            </p>
          </div>
        )}

        {/* Connecting */}
        {session.state === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner label="Connecting..." />
            <p className="text-sm text-muted-foreground">
              Starting recording...
            </p>
          </div>
        )}

        {/* Active recording / paused */}
        {(session.state === "recording" || session.state === "paused") && (
          <div className="space-y-4 py-2">
            {/* Timer and status */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-3 w-3 rounded-full",
                    session.state === "recording"
                      ? "animate-pulse bg-red-500"
                      : "bg-yellow-500"
                  )}
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {session.state === "recording" ? "Recording" : "Paused"}
                </span>
              </div>
              <div className="font-mono text-4xl font-bold tracking-wider text-foreground">
                {formatTime(session.elapsedTime)}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              {session.state === "recording" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => session.pauseRecording()}
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => session.resumeRecording()}
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleAddMarker}
              >
                <Bookmark className="h-3.5 w-3.5" />
                Marker
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={handleStop}
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>

            {/* Markers list */}
            {session.markers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {session.markers.map((marker, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={cn(
                      "gap-1 text-xs",
                      getMarkerColor(marker.type)
                    )}
                  >
                    <span className="font-mono text-[10px] opacity-70">
                      {formatTime(marker.time)}
                    </span>
                    {marker.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Live transcript */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Live Transcript
              </p>
              <div
                className="max-h-40 overflow-y-auto rounded-md border border-border bg-card p-3 text-sm text-foreground"
                onScroll={handleTranscriptScroll}
              >
                {session.transcript ? (
                  <p className="whitespace-pre-wrap">{session.transcript}</p>
                ) : (
                  <p className="italic text-muted-foreground">
                    Waiting for speech...
                  </p>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Stopping */}
        {session.state === "stopping" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner label="Finalizing..." />
            <p className="text-sm text-muted-foreground">
              Finalizing recording...
            </p>
          </div>
        )}

        {/* Stopped — recording complete */}
        {session.state === "stopped" && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border bg-secondary/30 p-4 text-center">
              <p className="text-sm font-medium text-foreground">
                Recording Complete
              </p>
              <div className="mt-2 flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(session.elapsedTime)}
                </span>
                <span>{session.segments.length} segments</span>
                <span>{session.markers.length} markers</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {session.state === "error" && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                {session.error ?? "An error occurred"}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {session.state === "idle" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button className="gap-1.5" onClick={handleStart}>
                <Mic className="h-4 w-4" />
                Start Recording
              </Button>
            </>
          )}
          {session.state === "stopped" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  session.reset();
                  handleOpenChange(false);
                }}
              >
                Close
              </Button>
              {session.sessionId && (
                <Button onClick={handleViewSession}>View Session</Button>
              )}
            </>
          )}
          {session.state === "error" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  session.reset();
                  handleOpenChange(false);
                }}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  session.reset();
                }}
              >
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
