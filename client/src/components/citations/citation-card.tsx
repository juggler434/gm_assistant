import * as React from "react";
import { useState } from "react";
import { FileText, BookOpen, Map, Image, StickyNote, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnswerSource } from "@/types";

const documentTypeIcons: Record<string, React.ReactNode> = {
  rulebook: <BookOpen className="h-4 w-4" />,
  setting: <BookOpen className="h-4 w-4" />,
  notes: <StickyNote className="h-4 w-4" />,
  map: <Map className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
};

function getDocumentIcon(documentType: string): React.ReactNode {
  return documentTypeIcons[documentType] ?? <FileText className="h-4 w-4" />;
}

function formatRelevanceScore(score: number): string {
  return (score * 100).toFixed(0) + "%";
}

function getRelevanceColor(score: number): string {
  if (score >= 0.8) return "text-success";
  if (score >= 0.5) return "text-warning";
  return "text-muted-foreground";
}

export interface CitationCardProps {
  source: AnswerSource;
  /** Optional text excerpt from the source chunk */
  excerpt?: string;
  /** Index label (e.g. 1, 2, 3) shown as a citation marker */
  index?: number;
  /** Callback when the card is clicked */
  onClick?: () => void;
  /** Callback to navigate to the full document */
  onOpenDocument?: (documentId: string) => void;
  className?: string;
}

export function CitationCard({
  source,
  excerpt,
  index,
  onClick,
  onOpenDocument,
  className,
}: CitationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const locationParts: string[] = [];
  if (source.pageNumber != null) {
    locationParts.push(`p. ${source.pageNumber}`);
  }
  if (source.section) {
    locationParts.push(source.section);
  }
  const locationText = locationParts.join(" \u00b7 ");

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else if (excerpt) {
      setExpanded((prev) => !prev);
    }
  };

  const handleOpenDocument = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenDocument?.(source.documentId);
  };

  return (
    <div
      role="article"
      className={cn(
        "group rounded-lg border border-border bg-card p-3 transition-colors",
        (onClick || excerpt) && "cursor-pointer hover:border-primary/40 hover:bg-accent/30",
        className
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3">
        {/* Citation index marker */}
        {index != null && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-bold text-primary">
            {index}
          </span>
        )}

        {/* Document type icon */}
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {getDocumentIcon(source.documentType)}
        </span>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {source.documentName}
            </span>
            <Badge variant="outline" className="shrink-0 text-[0.65rem] px-1.5 py-0">
              {source.documentType}
            </Badge>
          </div>

          {locationText && <p className="mt-0.5 text-xs text-muted-foreground">{locationText}</p>}

          {/* Excerpt preview (collapsed = 2 lines, expanded = full) */}
          {excerpt && (
            <p
              className={cn(
                "mt-1.5 text-xs leading-relaxed text-muted-foreground",
                !expanded && "line-clamp-2"
              )}
            >
              {excerpt}
            </p>
          )}
        </div>

        {/* Right side: relevance score + expand toggle */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("text-xs font-semibold", getRelevanceColor(source.relevanceScore))}>
            {formatRelevanceScore(source.relevanceScore)}
          </span>
          {excerpt && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={expanded ? "Collapse excerpt" : "Expand excerpt"}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Footer with link to document (visible on hover or when expanded) */}
      {onOpenDocument && expanded && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={handleOpenDocument}
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Open full document
          </button>
        </div>
      )}
    </div>
  );
}
