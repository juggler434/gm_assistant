import {
  FileText,
  Image,
  Map,
  BookOpen,
  Scroll,
  Download,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  ready: { variant: "success", icon: <CheckCircle2 className="h-3 w-3" />, label: "Ready" },
  processing: {
    variant: "warning",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: "Processing",
  },
  pending: { variant: "default", icon: <Clock className="h-3 w-3" />, label: "Pending" },
  failed: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, label: "Failed" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface DocumentCardProps {
  doc: Document;
  isSelected?: boolean;
  onSelect?: (doc: Document) => void;
  onDownload?: (doc: Document) => void;
}

export function DocumentCard({ doc, isSelected, onSelect, onDownload }: DocumentCardProps) {
  const status = statusConfig[doc.status];

  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-colors hover:border-primary/50",
        isSelected && "border-primary ring-1 ring-primary/30"
      )}
      onClick={() => onSelect?.(doc)}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          {typeIcons[doc.documentType]}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{doc.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatFileSize(doc.fileSize)} &middot; {formatDate(doc.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Badge variant={status.variant} className="gap-1">
          {status.icon}
          {status.label}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {doc.documentType}
        </Badge>
      </div>

      {doc.tags && doc.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {doc.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {doc.tags.length > 3 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              +{doc.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {doc.status === "failed" && doc.processingError && (
        <p className="mt-2 text-xs text-destructive">{doc.processingError}</p>
      )}

      {doc.status === "ready" && onDownload && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-7 w-7"
          aria-label={`Download ${doc.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDownload(doc);
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
    </Card>
  );
}
