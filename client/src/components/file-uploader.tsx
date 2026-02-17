// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { Upload, FileText, ImageIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_MIME_TYPES } from "@/types";
import type { SupportedMimeType } from "@/types";

const acceptedMimeTypes: Accept = Object.keys(SUPPORTED_MIME_TYPES).reduce((acc, mime) => {
  const ext = SUPPORTED_MIME_TYPES[mime as SupportedMimeType];
  acc[mime] = [`.${ext}`];
  return acc;
}, {} as Accept);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) {
    return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
  }
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

function getErrorMessage(rejection: FileRejection): string {
  const errors = rejection.errors;
if (errors.some((e) => e.code === "file-invalid-type")) {
    return "Unsupported file type";
  }
  return errors[0]?.message ?? "Invalid file";
}

interface FileUploaderProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  rejections: FileRejection[];
  onRejectionsCleared: () => void;
  disabled?: boolean;
}

export function FileUploader({
  files,
  onFilesSelected,
  onFileRemoved,
  rejections,
  onRejectionsCleared,
  disabled = false,
}: FileUploaderProps) {
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (accepted.length > 0) {
        onFilesSelected(accepted);
      }
      if (rejected.length > 0) {
        // Rejections are passed up so the parent can show them
        // We use the onFilesSelected callback pattern to keep it consistent
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: acceptedMimeTypes,
    multiple: true,
    disabled,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
  });

  const allRejections = [...rejections, ...fileRejections];

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/30",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <input {...(getInputProps() as React.InputHTMLAttributes<HTMLInputElement>)} />
        <Upload
          className={cn("h-10 w-10", isDragActive ? "text-primary" : "text-muted-foreground")}
        />
        {isDragActive ? (
          <p className="text-sm font-medium text-primary">Drop files here</p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, TXT, Markdown, DOCX, PNG, JPG, WebP
            </p>
          </>
        )}
      </div>

      {allRejections.length > 0 && (
        <div className="space-y-1.5">
          {allRejections.map((rejection, i) => (
            <div
              key={`${rejection.file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate font-medium">{rejection.file.name}</span>
              <span className="shrink-0">&mdash; {getErrorMessage(rejection)}</span>
              <button
                type="button"
                className="ml-auto shrink-0 text-xs underline hover:no-underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onRejectionsCleared();
                }}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1.5" aria-label="Selected files">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {getFileIcon(file)}
              <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              <button
                type="button"
                className="ml-auto shrink-0 text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
                onClick={() => onFileRemoved(index)}
                disabled={disabled}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
