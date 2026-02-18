// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FileRejection } from "react-dropzone";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploader } from "@/components/file-uploader";
import { UploadProgress } from "@/components/upload-progress";
import type { FileUploadState } from "@/components/upload-progress";
import { uploadWithProgress } from "@/lib/upload";
import { documentKeys } from "@/hooks/use-documents";
import type { DocumentType, DocumentResponse } from "@/types";

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "rulebook", label: "Rulebook" },
  { value: "setting", label: "Setting" },
  { value: "notes", label: "Notes" },
  { value: "map", label: "Map" },
  { value: "image", label: "Image" },
];

interface UploadDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadDialog({ campaignId, open, onOpenChange }: UploadDialogProps) {
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<File[]>([]);
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>("notes");
  const [tags, setTags] = useState("");
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Track abort controllers for each upload
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  const reset = useCallback(() => {
    // Abort any in-progress uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    setFiles([]);
    setRejections([]);
    setDocumentType("notes");
    setTags("");
    setUploads([]);
    setIsUploading(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isUploading) {
        // Don't allow closing while uploading — user must cancel
        return;
      }
      if (!nextOpen) {
        reset();
      }
      onOpenChange(nextOpen);
    },
    [isUploading, onOpenChange, reset]
  );

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setRejections([]);
  }, []);

  const handleFileRemoved = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCancel = useCallback((index: number) => {
    const controller = abortControllersRef.current.get(index);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(index);
    }
    setUploads((prev) =>
      prev.map((u, i) =>
        i === index && (u.status === "uploading" || u.status === "pending")
          ? { ...u, status: "error" as const, error: "Cancelled" }
          : u
      )
    );
  }, []);

  const handleCancelAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    setUploads((prev) =>
      prev.map((u) =>
        u.status === "uploading" || u.status === "pending"
          ? { ...u, status: "error" as const, error: "Cancelled" }
          : u
      )
    );
    setIsUploading(false);
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const initialUploads: FileUploadState[] = files.map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));

    setUploads(initialUploads);
    setIsUploading(true);

    let completedCount = 0;
    let failedCount = 0;

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const abortController = new AbortController();
      abortControllersRef.current.set(i, abortController);

      // Check if this file was already cancelled
      const currentState = initialUploads[i];
      if (currentState.status === "error") {
        failedCount++;
        continue;
      }

      setUploads((prev) =>
        prev.map((u, idx) => (idx === i ? { ...u, status: "uploading" as const } : u))
      );

      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      formData.append("documentType", documentType);
      if (parsedTags.length > 0) {
        formData.append("tags", JSON.stringify(parsedTags));
      }

      try {
        await uploadWithProgress<DocumentResponse>({
          url: `/api/campaigns/${campaignId}/documents`,
          formData,
          signal: abortController.signal,
          onProgress: (progress) => {
            setUploads((prev) =>
              prev.map((u, idx) => (idx === i ? { ...u, progress: progress.percent } : u))
            );
          },
        });

        completedCount++;
        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i ? { ...u, status: "complete" as const, progress: 100 } : u
          )
        );
      } catch (err) {
        failedCount++;
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Cancelled"
            : err instanceof Error
              ? err.message
              : "Upload failed";
        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: "error" as const, error: message } : u))
        );
      } finally {
        abortControllersRef.current.delete(i);
      }
    }

    // Invalidate document list to refresh
    queryClient.invalidateQueries({ queryKey: documentKeys.all(campaignId) });

    setIsUploading(false);

    if (failedCount === 0) {
      toast.success(
        completedCount === 1
          ? "Document uploaded successfully"
          : `${completedCount} documents uploaded successfully`
      );
      // Auto-close on full success after a brief pause
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 800);
    } else if (completedCount > 0) {
      toast.warning(`${completedCount} uploaded, ${failedCount} failed`);
    } else {
      toast.error("All uploads failed");
    }
  }, [files, tags, documentType, campaignId, queryClient, onOpenChange, reset]);

  const hasUploads = uploads.length > 0;
  const allDone =
    hasUploads && uploads.every((u) => u.status === "complete" || u.status === "error");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>Add files to your campaign's knowledge base.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!hasUploads && (
            <>
              <FileUploader
                files={files}
                onFilesSelected={handleFilesSelected}
                onFileRemoved={handleFileRemoved}
                rejections={rejections}
                onRejectionsCleared={() => setRejections([])}
                disabled={isUploading}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="upload-doc-type">Document Type</Label>
                  <Select
                    value={documentType}
                    onValueChange={(v: string) => setDocumentType(v as DocumentType)}
                  >
                    <SelectTrigger id="upload-doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>
                          {dt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upload-tags">Tags</Label>
                  <Input
                    id="upload-tags"
                    placeholder="e.g. strahd, ravenloft, npcs"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {hasUploads && <UploadProgress uploads={uploads} onCancel={handleCancel} />}
        </div>

        <DialogFooter>
          {!hasUploads && (
            <>
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={files.length === 0}>
                Upload {files.length > 0 && `(${files.length})`}
              </Button>
            </>
          )}

          {hasUploads && isUploading && (
            <Button variant="destructive" onClick={handleCancelAll}>
              Cancel All
            </Button>
          )}

          {hasUploads && allDone && (
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
