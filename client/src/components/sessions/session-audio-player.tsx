// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useRef, useCallback } from "react";
import { Play, Pause, Plus, X, Pencil, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useSessionAudioUrl,
  useAddMarker,
  useUpdateMarker,
  useDeleteMarker,
} from "@/hooks/use-sessions";
import type { TranscriptMarker } from "@/types";
import { toast } from "sonner";

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
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MARKER_TYPES = [
  { value: "general", label: "General" },
  { value: "combat", label: "Combat" },
  { value: "roleplay", label: "Roleplay" },
  { value: "loot", label: "Loot" },
  { value: "important", label: "Important" },
];

interface SessionAudioPlayerProps {
  campaignId: string;
  sessionId: string;
  markers: TranscriptMarker[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  fallbackDuration: number | null;
}

interface EditingMarker {
  originalTime: number;
  originalLabel: string;
  label: string;
  type: string;
  notes: string;
}

export function SessionAudioPlayer({
  campaignId,
  sessionId,
  markers,
  audioRef,
  fallbackDuration,
}: SessionAudioPlayerProps) {
  const { data: audioData, isLoading: audioLoading } = useSessionAudioUrl(
    campaignId,
    sessionId
  );
  const addMarker = useAddMarker();
  const updateMarker = useUpdateMarker();
  const deleteMarker = useDeleteMarker();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  // <audio> reports 0/Infinity for WebM/Opus with no container duration header.
  // Fall back to the server-side duration measured during transcription.
  const duration =
    Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : fallbackDuration ?? 0;
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [markerTime, setMarkerTime] = useState(0);
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerType, setMarkerType] = useState("general");
  const [markerNotes, setMarkerNotes] = useState("");
  const [editing, setEditing] = useState<EditingMarker | null>(null);

  const progressRef = useRef<HTMLDivElement>(null);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [audioRef]);

  const seekTo = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = time;
      setCurrentTime(time);
    },
    [audioRef]
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect || duration === 0) return;
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(fraction * duration);
    },
    [duration, seekTo]
  );

  const openMarkerForm = useCallback(() => {
    setEditing(null);
    setMarkerTime(currentTime);
    setMarkerLabel("");
    setMarkerType("general");
    setMarkerNotes("");
    setShowMarkerForm(true);
  }, [currentTime]);

  const submitMarker = useCallback(() => {
    if (!markerLabel.trim()) return;
    addMarker.mutate(
      {
        campaignId,
        sessionId,
        data: {
          time: markerTime,
          label: markerLabel.trim(),
          type: markerType,
          ...(markerNotes.trim() ? { notes: markerNotes.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success("Marker added");
          setShowMarkerForm(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  }, [campaignId, sessionId, markerTime, markerLabel, markerType, markerNotes, addMarker]);

  const openEditForm = useCallback((marker: TranscriptMarker) => {
    setShowMarkerForm(false);
    setEditing({
      originalTime: marker.time,
      originalLabel: marker.label,
      label: marker.label,
      type: marker.type,
      notes: marker.notes ?? "",
    });
  }, []);

  const submitEdit = useCallback(() => {
    if (!editing || !editing.label.trim()) return;
    updateMarker.mutate(
      {
        campaignId,
        sessionId,
        data: {
          originalTime: editing.originalTime,
          originalLabel: editing.originalLabel,
          label: editing.label.trim(),
          type: editing.type,
          notes: editing.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Marker updated");
          setEditing(null);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  }, [campaignId, sessionId, editing, updateMarker]);

  const handleDeleteMarker = useCallback(
    (marker: TranscriptMarker) => {
      deleteMarker.mutate(
        { campaignId, sessionId, time: marker.time, label: marker.label },
        {
          onSuccess: () => {
            toast.success("Marker removed");
            if (
              editing &&
              editing.originalTime === marker.time &&
              editing.originalLabel === marker.label
            ) {
              setEditing(null);
            }
          },
          onError: (err) => toast.error(err.message),
        }
      );
    },
    [campaignId, sessionId, deleteMarker, editing]
  );

  if (audioLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Spinner label="Loading audio..." />
        </CardContent>
      </Card>
    );
  }

  if (!audioData) return null;

  const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Volume2 className="h-4 w-4" />
          Audio Playback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <audio
          ref={audioRef}
          src={audioData.url}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setAudioDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={togglePlayPause}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-2 flex-1 cursor-pointer rounded-full bg-secondary"
            onClick={handleProgressClick}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
            {/* Marker dots on the progress bar */}
            {sortedMarkers.map((marker, i) => {
              const pos = duration > 0 ? (marker.time / duration) * 100 : 0;
              return (
                <div
                  key={i}
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-primary/80"
                  style={{ left: `${pos}%` }}
                  title={marker.label}
                />
              );
            })}
          </div>

          {/* Time display */}
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Add marker button */}
        {!showMarkerForm && !editing && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openMarkerForm}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Marker at {formatTime(currentTime)}
          </Button>
        )}

        {/* Marker creation form */}
        {showMarkerForm && (
          <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                New marker at {formatTime(markerTime)}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowMarkerForm(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Label (required)"
                value={markerLabel}
                onChange={(e) => setMarkerLabel(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitMarker();
                }}
                autoFocus
              />
              <select
                value={markerType}
                onChange={(e) => setMarkerType(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
              >
                {MARKER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="Notes (optional)"
              value={markerNotes}
              onChange={(e) => setMarkerNotes(e.target.value)}
            />
            <Button
              size="sm"
              onClick={submitMarker}
              disabled={!markerLabel.trim() || addMarker.isPending}
            >
              {addMarker.isPending ? "Adding..." : "Add Marker"}
            </Button>
          </div>
        )}

        {/* Marker edit form */}
        {editing && (
          <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Edit marker at {formatTime(editing.originalTime)}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditing(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Label (required)"
                value={editing.label}
                onChange={(e) =>
                  setEditing((prev) => prev && { ...prev, label: e.target.value })
                }
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitEdit();
                }}
                autoFocus
              />
              <select
                value={editing.type}
                onChange={(e) =>
                  setEditing((prev) => prev && { ...prev, type: e.target.value })
                }
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
              >
                {MARKER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="Notes (optional)"
              value={editing.notes}
              onChange={(e) =>
                setEditing((prev) => prev && { ...prev, notes: e.target.value })
              }
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={submitEdit}
                disabled={!editing.label.trim() || updateMarker.isPending}
              >
                {updateMarker.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Existing markers */}
        {sortedMarkers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sortedMarkers.map((marker, i) => (
              <Badge
                key={i}
                variant="outline"
                className={cn(
                  "group cursor-pointer gap-1 text-xs",
                  getMarkerColor(marker.type)
                )}
                onClick={() => seekTo(marker.time)}
                title={marker.notes ?? undefined}
              >
                <span className="font-mono text-[10px] opacity-70">
                  {formatTime(marker.time)}
                </span>
                {marker.label}
                <button
                  type="button"
                  className="ml-0.5 hidden rounded-full p-0.5 opacity-70 hover:opacity-100 group-hover:inline-flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditForm(marker);
                  }}
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  className="hidden rounded-full p-0.5 opacity-70 hover:opacity-100 group-hover:inline-flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMarker(marker);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
