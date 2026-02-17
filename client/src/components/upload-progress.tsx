// SPDX-License-Identifier: AGPL-3.0-or-later

import { FileText, ImageIcon, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FileUploadStatus = "pending" | "uploading" | "complete" | "error";

export interface FileUploadState {
  file: File;
  status: FileUploadStatus;
  progress: number;
  error?: string;
  abortController?: AbortController;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function StatusIcon({ status }: { status: FileUploadStatus }) {
  switch (status) {
    case "complete":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
    case "error":
      return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
    case "uploading":
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
    default:
      return null;
  }
}

interface UploadProgressItemProps {
  state: FileUploadState;
  onCancel?: () => void;
}

function UploadProgressItem({ state, onCancel }: UploadProgressItemProps) {
  const { file, status, progress, error } = state;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        status === "error" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        {getFileIcon(file)}
        <span className="truncate font-medium text-foreground">{file.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
        <div className="ml-auto flex items-center gap-2">
          <StatusIcon status={status} />
          {(status === "uploading" || status === "pending") && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Cancel upload of ${file.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {(status === "uploading" || status === "pending") && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Upload progress for ${file.name}`}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status === "pending" ? "Waiting..." : `${progress}%`}
          </p>
        </div>
      )}

      {status === "error" && error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface UploadProgressProps {
  uploads: FileUploadState[];
  onCancel?: (index: number) => void;
}

export function UploadProgress({ uploads, onCancel }: UploadProgressProps) {
  if (uploads.length === 0) return null;

  const completed = uploads.filter((u) => u.status === "complete").length;
  const failed = uploads.filter((u) => u.status === "error").length;
  const total = uploads.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completed} of {total} uploaded
          {failed > 0 && <span className="text-destructive"> ({failed} failed)</span>}
        </span>
      </div>
      <div className="space-y-1.5" role="list" aria-label="Upload progress">
        {uploads.map((upload, index) => (
          <UploadProgressItem
            key={`${upload.file.name}-${upload.file.size}-${index}`}
            state={upload}
            onCancel={
              upload.status === "uploading" || upload.status === "pending"
                ? () => onCancel?.(index)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
