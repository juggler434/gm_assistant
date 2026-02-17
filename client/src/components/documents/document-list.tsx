// SPDX-License-Identifier: AGPL-3.0-or-later

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
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Document, DocumentType, DocumentStatus } from "@/types";

const typeIcons: Record<DocumentType, React.ReactNode> = {
  rulebook: <BookOpen className="h-4 w-4" />,
  setting: <Scroll className="h-4 w-4" />,
  notes: <FileText className="h-4 w-4" />,
  map: <Map className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
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

interface DocumentListProps {
  documents: Document[];
  selectedId?: string;
  onSelect?: (doc: Document) => void;
  onDownload?: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
}

export function DocumentList({
  documents,
  selectedId,
  onSelect,
  onDownload,
  onDelete,
}: DocumentListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Name</th>
            <th className="pb-3 pr-4 font-medium">Type</th>
            <th className="pb-3 pr-4 font-medium">Size</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Uploaded</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const status = statusConfig[doc.status];
            return (
              <tr
                key={doc.id}
                className={cn(
                  "border-b border-border transition-colors hover:bg-accent/50 cursor-pointer",
                  selectedId === doc.id && "bg-accent/50"
                )}
                onClick={() => onSelect?.(doc)}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{typeIcons[doc.documentType]}</span>
                    <span className="font-medium">{doc.name}</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant="outline" className="capitalize">
                    {doc.documentType}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{formatFileSize(doc.fileSize)}</td>
                <td className="py-3 pr-4">
                  <Badge variant={status.variant} className="gap-1">
                    {status.icon}
                    {status.label}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(doc.createdAt)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    {doc.status === "ready" && onDownload && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Download ${doc.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(doc);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${doc.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(doc);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
