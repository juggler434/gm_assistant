// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Document, DocumentType, UpdateDocumentRequest } from "@/types";

interface DocumentEditFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: UpdateDocumentRequest) => void;
  isLoading: boolean;
  doc: Document;
}

const documentTypeLabels: Record<DocumentType, string> = {
  rulebook: "Rulebook",
  setting: "Setting",
  notes: "Notes",
  character: "Character",
  map: "Map",
  image: "Image",
  transcript: "Transcript",
};

export function DocumentEditForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  doc,
}: DocumentEditFormProps) {
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("notes");
  const [tagsStr, setTagsStr] = useState("");

  useEffect(() => {
    if (open && doc) {
      setName(doc.name);
      setDocumentType(doc.documentType);
      setTagsStr(doc.tags?.join(", ") ?? "");
    }
  }, [doc, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagsStr.trim()
      ? tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : null;

    onSubmit({
      name: name.trim(),
      documentType,
      tags,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">Name *</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document name"
              maxLength={255}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-type">Type</Label>
            <Select
              value={documentType}
              onValueChange={(v: string) => setDocumentType(v as DocumentType)}
            >
              <SelectTrigger id="doc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(documentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-tags">Tags (comma-separated)</Label>
            <Input
              id="doc-tags"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. combat, lore, chapter-1"
              disabled={isLoading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
