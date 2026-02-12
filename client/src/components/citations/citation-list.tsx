import { cn } from "@/lib/utils";
import { CitationCard } from "./citation-card";
import type { AnswerSource, ConfidenceLevel } from "@/types";

const confidenceStyles: Record<ConfidenceLevel, { label: string; className: string }> = {
  high: { label: "High", className: "text-success" },
  medium: { label: "Medium", className: "text-warning" },
  low: { label: "Low", className: "text-destructive" },
};

export interface CitationExcerpt {
  documentId: string;
  excerpt: string;
}

export interface CitationListProps {
  sources: AnswerSource[];
  /** Optional excerpts keyed by documentId */
  excerpts?: CitationExcerpt[];
  /** Confidence level to display */
  confidence?: ConfidenceLevel;
  /** Callback when a citation card is clicked */
  onCitationClick?: (source: AnswerSource) => void;
  /** Callback to navigate to a full document */
  onOpenDocument?: (documentId: string) => void;
  className?: string;
}

export function CitationList({
  sources,
  excerpts,
  confidence,
  onCitationClick,
  onOpenDocument,
  className,
}: CitationListProps) {
  if (sources.length === 0) return null;

  const excerptMap = new Map(excerpts?.map((e) => [e.documentId, e.excerpt]));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Sources</span>
        <span className="text-xs text-muted-foreground">({sources.length})</span>
        {confidence && (
          <>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-xs text-muted-foreground">
              Confidence:{" "}
              <strong className={confidenceStyles[confidence].className}>
                {confidenceStyles[confidence].label}
              </strong>
            </span>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        {sources.map((source, i) => (
          <CitationCard
            key={`${source.documentId}-${source.pageNumber ?? i}`}
            source={source}
            excerpt={excerptMap.get(source.documentId)}
            index={i + 1}
            onClick={onCitationClick ? () => onCitationClick(source) : undefined}
            onOpenDocument={onOpenDocument}
          />
        ))}
      </div>
    </div>
  );
}
