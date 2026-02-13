import {
  X,
  Download,
  Trash2,
  FileText,
  Image,
  Map,
  BookOpen,
  Scroll,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Document, DocumentType, DocumentStatus } from "@/types";

const typeIcons: Record<DocumentType, React.ReactNode> = {
  rulebook: <BookOpen className="h-5 w-5" />,
  setting: <Scroll className="h-5 w-5" />,
  notes: <FileText className="h-5 w-5" />,
  map: <Map className="h-5 w-5" />,
  image: <Image className="h-5 w-5" />,
};

const statusConfig: Record<
  DocumentStatus,
  {
    variant: "success" | "warning" | "default" | "destructive";
    icon: React.ReactNode;
    label: string;
  }
> = {
  ready: { variant: "success", icon: <CheckCircle2 className="h-4 w-4" />, label: "Ready" },
  processing: {
    variant: "warning",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: "Processing",
  },
  pending: { variant: "default", icon: <Clock className="h-4 w-4" />, label: "Pending" },
  failed: { variant: "destructive", icon: <AlertCircle className="h-4 w-4" />, label: "Failed" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface DocumentDetailsProps {
  doc: Document;
  onClose: () => void;
  onDownload?: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
  onRetry?: (doc: Document) => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{children}</span>
    </div>
  );
}

export function DocumentDetails({
  doc,
  onClose,
  onDownload,
  onDelete,
  onRetry,
}: DocumentDetailsProps) {
  const status = statusConfig[doc.status];

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Document Details</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Icon and name */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            {typeIcons[doc.documentType]}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-foreground break-words">{doc.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.originalFilename}</p>
          </div>
        </div>

        {/* Status section */}
        <div className="mb-4">
          <Badge variant={status.variant} className="gap-1.5">
            {status.icon}
            {status.label}
          </Badge>
        </div>

        {doc.status === "failed" && doc.processingError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{doc.processingError}</p>
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1"
                onClick={() => onRetry(doc)}
              >
                <RefreshCw className="h-3 w-3" />
                Retry Processing
              </Button>
            )}
          </div>
        )}

        {doc.status === "processing" && (
          <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 p-3">
            <div className="flex items-center gap-2 text-xs text-warning">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Document is being processed...
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-0">
          <DetailRow label="Type">
            <span className="capitalize">{doc.documentType}</span>
          </DetailRow>
          <DetailRow label="Size">{formatFileSize(doc.fileSize)}</DetailRow>
          <DetailRow label="MIME Type">
            <span className="font-mono text-xs">{doc.mimeType}</span>
          </DetailRow>
          <DetailRow label="Uploaded">{formatDateTime(doc.createdAt)}</DetailRow>
          <DetailRow label="Updated">{formatDateTime(doc.updatedAt)}</DetailRow>
          {doc.chunkCount != null && <DetailRow label="Chunks">{doc.chunkCount}</DetailRow>}
        </div>

        {/* Tags */}
        {doc.tags && doc.tags.length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-medium text-muted-foreground">Tags</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {doc.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {doc.metadata && Object.keys(doc.metadata).length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-medium text-muted-foreground">Metadata</span>
            <div className="mt-1.5 space-y-0">
              {doc.metadata.description && (
                <DetailRow label="Description">{doc.metadata.description}</DetailRow>
              )}
              {doc.metadata.author && <DetailRow label="Author">{doc.metadata.author}</DetailRow>}
              {doc.metadata.pageCount != null && (
                <DetailRow label="Pages">{doc.metadata.pageCount}</DetailRow>
              )}
              {doc.metadata.system && <DetailRow label="System">{doc.metadata.system}</DetailRow>}
              {doc.metadata.edition && (
                <DetailRow label="Edition">{doc.metadata.edition}</DetailRow>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-2">
        {doc.status === "ready" && onDownload && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => onDownload(doc)}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(doc)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
