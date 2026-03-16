// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useRef, useCallback, useMemo } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TranscriptSegment, TranscriptMarker } from "@/types";

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  markers: TranscriptMarker[];
  onTimestampClick?: (time: number) => void;
}

export function TranscriptViewer({
  segments,
  markers,
  onTimestampClick,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Build a map of markers by time for quick lookup
  const markersByTime = useMemo(() => {
    const map = new Map<number, TranscriptMarker[]>();
    for (const marker of markers) {
      const key = Math.floor(marker.time);
      const existing = map.get(key) ?? [];
      existing.push(marker);
      map.set(key, existing);
    }
    return map;
  }, [markers]);

  // Find matching segment indices
  const matchingIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return segments
      .map((seg, i) => (seg.text.toLowerCase().includes(query) ? i : -1))
      .filter((i) => i !== -1);
  }, [segments, searchQuery]);

  const totalMatches = matchingIndices.length;

  const scrollToMatch = useCallback(
    (index: number) => {
      const segIndex = matchingIndices[index];
      if (segIndex == null) return;
      const el = segmentRefs.current.get(segIndex);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [matchingIndices]
  );

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const next = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(next);
    scrollToMatch(next);
  }, [currentMatchIndex, totalMatches, scrollToMatch]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const prev = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prev);
    scrollToMatch(prev);
  }, [currentMatchIndex, totalMatches, scrollToMatch]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Find markers near a segment's time range
  function getMarkersForSegment(segment: TranscriptSegment): TranscriptMarker[] {
    const result: TranscriptMarker[] = [];
    const startSec = Math.floor(segment.startTime);
    const endSec = Math.floor(segment.endTime);
    for (let t = startSec; t <= endSec; t++) {
      const m = markersByTime.get(t);
      if (m) result.push(...m);
    }
    return result;
  }

  // Highlight search matches in text
  function highlightText(text: string, segmentIndex: number) {
    if (!searchQuery.trim()) return text;
    const query = searchQuery.toLowerCase();
    const parts: { text: string; isMatch: boolean }[] = [];
    let remaining = text;
    let lowerRemaining = remaining.toLowerCase();
    let pos = lowerRemaining.indexOf(query);

    while (pos !== -1) {
      if (pos > 0) {
        parts.push({ text: remaining.slice(0, pos), isMatch: false });
      }
      parts.push({ text: remaining.slice(pos, pos + query.length), isMatch: true });
      remaining = remaining.slice(pos + query.length);
      lowerRemaining = remaining.toLowerCase();
      pos = lowerRemaining.indexOf(query);
    }
    if (remaining) {
      parts.push({ text: remaining, isMatch: false });
    }

    const isCurrentMatchSegment =
      matchingIndices[currentMatchIndex] === segmentIndex;

    return parts.map((part, i) =>
      part.isMatch ? (
        <mark
          key={i}
          className={cn(
            "rounded px-0.5",
            isCurrentMatchSegment
              ? "bg-primary/40 text-foreground"
              : "bg-primary/20 text-foreground"
          )}
        >
          {part.text}
        </mark>
      ) : (
        <span key={i}>{part.text}</span>
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) goToPrevMatch();
                else goToNextMatch();
              }
            }}
            className="pl-9 pr-20"
          />
          {searchQuery && (
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {totalMatches > 0
                  ? `${currentMatchIndex + 1}/${totalMatches}`
                  : "0/0"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearSearch}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Transcript segments */}
      <div className="space-y-1">
        {segments.map((segment, index) => {
          const segmentMarkers = getMarkersForSegment(segment);
          const isMatch = matchingIndices.includes(index);

          return (
            <div
              key={index}
              ref={(el) => {
                if (el) segmentRefs.current.set(index, el);
                else segmentRefs.current.delete(index);
              }}
              className={cn(
                "group flex gap-3 rounded-md px-3 py-2 transition-colors",
                isMatch && "bg-accent/50",
                segmentMarkers.length > 0 && "border-l-2 border-primary/50"
              )}
            >
              {/* Timestamp */}
              <button
                type="button"
                className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
                onClick={() => onTimestampClick?.(segment.startTime)}
                title="Jump to timestamp"
              >
                {formatTimestamp(segment.startTime)}
              </button>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {segment.speaker && segment.speaker !== "unknown" && (
                  <span className="mr-2 text-xs font-semibold text-primary/80">
                    {segment.speaker}
                  </span>
                )}
                <span className="text-sm text-foreground">
                  {highlightText(segment.text, index)}
                </span>

                {/* Markers */}
                {segmentMarkers.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {segmentMarkers.map((marker, mi) => (
                      <Badge
                        key={mi}
                        variant="outline"
                        className={cn(
                          "cursor-pointer text-[10px]",
                          getMarkerColor(marker.type)
                        )}
                        onClick={() => onTimestampClick?.(marker.time)}
                        title={marker.notes ?? undefined}
                      >
                        {marker.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
