// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUploadSession } from "@/hooks/use-sessions";
import { SUPPORTED_AUDIO_MIME_TYPES } from "@/types";

interface UploadSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

const acceptConfig = Object.keys(SUPPORTED_AUDIO_MIME_TYPES).reduce<Record<string, string[]>>(
  (acc, mime) => {
    acc[mime] = [];
    return acc;
  },
  {}
);

export function UploadSessionDialog({ open, onOpenChange, campaignId }: UploadSessionDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  const uploadSession = useUploadSession();

  const resetForm = useCallback(() => {
    setFile(null);
    setTitle("");
    setDate("");
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm]
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptConfig,
    maxFiles: 1,
    multiple: false,
  });

  const handleSubmit = async () => {
    if (!file) return;
    try {
      await uploadSession.mutateAsync({
        campaignId,
        file,
        title: title || undefined,
        date: date || undefined,
      });
      toast.success("Session uploaded successfully");
      handleOpenChange(false);
    } catch {
      toast.error("Failed to upload session");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Session Recording</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {file ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
              <span className="truncate text-sm">{file.name}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop an audio file, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">MP3, WAV, or M4A</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="session-title">Title (optional)</Label>
            <Input
              id="session-title"
              placeholder="e.g. Session 12 — Descent into Avernus"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-date">Date (optional)</Label>
            <Input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!file || uploadSession.isPending}>
            {uploadSession.isPending ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
