// SPDX-License-Identifier: AGPL-3.0-or-later

import { FileText } from "lucide-react";
import { CitationCard } from "@/components/citations/citation-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnswerSource, ConfidenceLevel } from "@/types";

const confidenceStyles: Record<
  ConfidenceLevel,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  high: { label: "High", variant: "success" },
  medium: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "destructive" },
};

export interface ContextPanelProps {
  sources: AnswerSource[];
  confidence?: ConfidenceLevel;
  onOpenDocument?: (documentId: string) => void;
  className?: string;
}

export function ContextPanel({
  sources,
  confidence,
  onOpenDocument,
  className,
}: ContextPanelProps) {
  return (
    <div className={cn("flex h-full flex-col border-l border-border bg-sidebar", className)}>
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Retrieved Context</h3>
        {confidence && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <Badge
              variant={confidenceStyles[confidence].variant}
              className="text-[0.65rem] px-1.5 py-0"
            >
              {confidenceStyles[confidence].label}
            </Badge>
          </div>
        )}
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto p-3">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <FileText className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Source citations will appear here when you ask a question.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source, i) => (
              <CitationCard
                key={`${source.documentId}-${source.pageNumber ?? i}`}
                source={source}
                index={i + 1}
                onOpenDocument={onOpenDocument}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
