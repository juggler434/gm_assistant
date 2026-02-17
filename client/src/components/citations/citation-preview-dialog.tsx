// SPDX-License-Identifier: AGPL-3.0-or-later

import { FileText, BookOpen, Map, Image, StickyNote, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnswerSource } from "@/types";

const documentTypeIcons: Record<string, React.ReactNode> = {
  rulebook: <BookOpen className="h-5 w-5" />,
  setting: <BookOpen className="h-5 w-5" />,
  notes: <StickyNote className="h-5 w-5" />,
  map: <Map className="h-5 w-5" />,
  image: <Image className="h-5 w-5" />,
};

function getDocumentIcon(documentType: string): React.ReactNode {
  return documentTypeIcons[documentType] ?? <FileText className="h-5 w-5" />;
}

function getRelevanceColor(score: number): string {
  if (score >= 0.8) return "text-success";
  if (score >= 0.5) return "text-warning";
  return "text-muted-foreground";
}

export interface CitationPreviewDialogProps {
  source: AnswerSource | null;
  /** Optional text excerpt from the source chunk */
  excerpt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback to navigate to the full document */
  onOpenDocument?: (documentId: string) => void;
}

export function CitationPreviewDialog({
  source,
  excerpt,
  open,
  onOpenChange,
  onOpenDocument,
}: CitationPreviewDialogProps) {
  if (!source) return null;

  const locationParts: string[] = [];
  if (source.pageNumber != null) {
    locationParts.push(`Page ${source.pageNumber}`);
  }
  if (source.section) {
    locationParts.push(source.section);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{getDocumentIcon(source.documentType)}</span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{source.documentName}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[0.65rem] px-1.5 py-0">
                  {source.documentType}
                </Badge>
                {locationParts.length > 0 && (
                  <span className="text-xs">{locationParts.join(" \u00b7 ")}</span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Relevance score */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Relevance:</span>
          <span className={cn("font-semibold", getRelevanceColor(source.relevanceScore))}>
            {(source.relevanceScore * 100).toFixed(0)}%
          </span>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-secondary">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  source.relevanceScore >= 0.8
                    ? "bg-success"
                    : source.relevanceScore >= 0.5
                      ? "bg-warning"
                      : "bg-muted-foreground"
                )}
                style={{ width: `${source.relevanceScore * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Excerpt content */}
        {excerpt ? (
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Excerpt
            </p>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{excerpt}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No excerpt preview available for this source.
            </p>
          </div>
        )}

        <DialogFooter>
          {onOpenDocument && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onOpenDocument(source.documentId);
                onOpenChange(false);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open Document
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
