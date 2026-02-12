import { useParams } from "react-router-dom";
import { FileText, Plus, Download } from "lucide-react";
import { useDocuments } from "@/hooks/use-documents";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentStatus, Document } from "@/types";

const statusVariant: Record<DocumentStatus, "success" | "warning" | "default" | "destructive"> = {
  ready: "success",
  processing: "warning",
  pending: "default",
  failed: "destructive",
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

function DocumentRow({ doc }: { doc: Document }) {
  return (
    <tr className="border-b border-border transition-colors hover:bg-accent/50">
      <td className="py-3 pr-4 font-medium">{doc.name}</td>
      <td className="py-3 pr-4 capitalize text-muted-foreground">{doc.documentType}</td>
      <td className="py-3 pr-4 text-muted-foreground">{formatFileSize(doc.fileSize)}</td>
      <td className="py-3 pr-4">
        <Badge variant={statusVariant[doc.status]}>{doc.status}</Badge>
      </td>
      <td className="py-3 pr-4 text-muted-foreground">{formatDate(doc.createdAt)}</td>
      <td className="py-3">
        <Button variant="ghost" size="icon" aria-label={`Download ${doc.name}`}>
          <Download className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export function DocumentsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: documents, isLoading, isError, refetch } = useDocuments(campaignId!);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Documents</h2>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-0">
          {Array.from({ length: 5 }, (_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          description="Failed to load documents. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {documents && documents.length === 0 && (
        <EmptyState
          icon={<FileText />}
          heading="No documents yet"
          description="Upload documents to build your campaign's knowledge base."
          action={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Upload Document
            </Button>
          }
        />
      )}

      {documents && documents.length > 0 && (
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
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
