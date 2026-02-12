import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CitationList } from "./citation-list";
import { CitationPreviewDialog } from "./citation-preview-dialog";
import type { CitationExcerpt } from "./citation-list";
import type { AnswerSource, ConfidenceLevel } from "@/types";

export interface CitationPanelProps {
  sources: AnswerSource[];
  excerpts?: CitationExcerpt[];
  confidence?: ConfidenceLevel;
  className?: string;
}

/**
 * Composable panel that renders a CitationList and manages
 * the preview dialog and document navigation.
 */
export function CitationPanel({ sources, excerpts, confidence, className }: CitationPanelProps) {
  const navigate = useNavigate();
  const { id: campaignId } = useParams<{ id: string }>();
  const [previewSource, setPreviewSource] = useState<AnswerSource | null>(null);

  const excerptMap = new Map(excerpts?.map((e) => [e.documentId, e.excerpt]));

  const handleCitationClick = useCallback((source: AnswerSource) => {
    setPreviewSource(source);
  }, []);

  const handleOpenDocument = useCallback(
    (documentId: string) => {
      if (campaignId) {
        navigate(`/campaigns/${campaignId}/documents#doc-${documentId}`);
      }
    },
    [campaignId, navigate]
  );

  return (
    <>
      <CitationList
        sources={sources}
        excerpts={excerpts}
        confidence={confidence}
        onCitationClick={handleCitationClick}
        onOpenDocument={handleOpenDocument}
        className={className}
      />

      <CitationPreviewDialog
        source={previewSource}
        excerpt={previewSource ? excerptMap.get(previewSource.documentId) : undefined}
        open={previewSource !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
        onOpenDocument={handleOpenDocument}
      />
    </>
  );
}
