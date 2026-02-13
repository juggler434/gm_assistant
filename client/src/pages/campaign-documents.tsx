import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { FileText, Plus, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { useDocuments, useDeleteDocument } from "@/hooks/use-documents";
import { TableRowSkeleton, CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentList } from "@/components/documents/document-list";
import { FilterBar, type FilterState } from "@/components/documents/filter-bar";
import { DocumentDetails } from "@/components/documents/document-details";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";

type ViewMode = "grid" | "list";

const VIEW_MODE_KEY = "gm-assistant-doc-view";

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "grid" || stored === "list") return stored;
  } catch {
    // localStorage may not be available
  }
  return "list";
}

function storeViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export function DocumentsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: documents, isLoading, isError, refetch } = useDocuments(campaignId!);
  const deleteDocument = useDeleteDocument();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    documentType: "all",
    status: "all",
  });

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  }, []);

  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter((doc) => {
      if (
        filters.search &&
        !doc.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !(doc.tags ?? []).some((t) => t.toLowerCase().includes(filters.search.toLowerCase()))
      ) {
        return false;
      }
      if (filters.documentType !== "all" && doc.documentType !== filters.documentType) {
        return false;
      }
      if (filters.status !== "all" && doc.status !== filters.status) {
        return false;
      }
      return true;
    });
  }, [documents, filters]);

  const handleSelect = useCallback((doc: Document) => {
    setSelectedDoc((prev) => (prev?.id === doc.id ? null : doc));
  }, []);

  const handleDownload = useCallback(
    async (doc: Document) => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/documents/${doc.id}/download`);
        if (!res.ok) throw new Error("Failed to get download URL");
        const data = await res.json();
        window.open(data.url, "_blank");
      } catch {
        toast.error("Failed to download document");
      }
    },
    [campaignId]
  );

  const handleDelete = useCallback(
    (doc: Document) => {
      if (!confirm(`Delete "${doc.name}"? This action cannot be undone.`)) return;
      deleteDocument.mutate(
        { campaignId: campaignId!, id: doc.id },
        {
          onSuccess: () => {
            toast.success("Document deleted");
            if (selectedDoc?.id === doc.id) setSelectedDoc(null);
          },
          onError: () => toast.error("Failed to delete document"),
        }
      );
    },
    [campaignId, deleteDocument, selectedDoc]
  );

  const hasDocuments = documents && documents.length > 0;
  const hasFilteredResults = filteredDocuments.length > 0;
  const showDetails = selectedDoc !== null;

  return (
    <div className="flex h-full gap-0">
      {/* Main content area */}
      <div className={cn("flex-1 min-w-0", showDetails && "pr-0")}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Documents</h2>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            {hasDocuments && (
              <div className="flex items-center rounded-md border border-border bg-secondary">
                <button
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-l-md transition-colors",
                    viewMode === "list"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleViewModeChange("list")}
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-r-md transition-colors",
                    viewMode === "grid"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleViewModeChange("grid")}
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            )}
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        {hasDocuments && (
          <div className="mb-4">
            <FilterBar filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* Loading state */}
        {isLoading &&
          (viewMode === "list" ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }, (_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ))}

        {/* Error state */}
        {isError && (
          <ErrorState
            description="Failed to load documents. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {/* Empty state - no documents at all */}
        {documents && documents.length === 0 && (
          <EmptyState
            icon={<FileText />}
            heading="No documents yet"
            description="Upload documents to build your campaign's knowledge base."
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
                Upload Document
              </Button>
            }
          />
        )}

        {/* Empty state - filters returned no results */}
        {hasDocuments && !hasFilteredResults && (
          <EmptyState
            icon={<FileText />}
            heading="No matching documents"
            description="Try adjusting your search or filters."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFilters({ search: "", documentType: "all", status: "all" })}
              >
                Clear filters
              </Button>
            }
          />
        )}

        {/* Document views */}
        {hasFilteredResults && viewMode === "list" && (
          <DocumentList
            documents={filteredDocuments}
            selectedId={selectedDoc?.id}
            onSelect={handleSelect}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        )}

        {hasFilteredResults && viewMode === "grid" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isSelected={selectedDoc?.id === doc.id}
                onSelect={handleSelect}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* Result count */}
        {hasDocuments && hasFilteredResults && (
          <p className="mt-3 text-xs text-muted-foreground">
            {filteredDocuments.length === documents.length
              ? `${documents.length} document${documents.length !== 1 ? "s" : ""}`
              : `${filteredDocuments.length} of ${documents.length} documents`}
          </p>
        )}
      </div>

      {/* Details panel */}
      {showDetails && (
        <div className="hidden w-[320px] shrink-0 lg:block">
          <DocumentDetails
            doc={selectedDoc}
            onClose={() => setSelectedDoc(null)}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        </div>
      )}

      <UploadDialog campaignId={campaignId!} open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
