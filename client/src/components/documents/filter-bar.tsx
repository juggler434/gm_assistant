// SPDX-License-Identifier: AGPL-3.0-or-later

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { DocumentType, DocumentStatus } from "@/types";

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "rulebook", label: "Rulebook" },
  { value: "setting", label: "Setting" },
  { value: "notes", label: "Notes" },
  { value: "map", label: "Map" },
  { value: "image", label: "Image" },
];

const STATUS_OPTIONS: { value: DocumentStatus; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

export interface FilterState {
  search: string;
  documentType: DocumentType | "all";
  status: DocumentStatus | "all";
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const hasActiveFilters =
    filters.search !== "" || filters.documentType !== "all" || filters.status !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-[280px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.documentType}
        onValueChange={(v: string) =>
          onChange({ ...filters, documentType: v as DocumentType | "all" })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {DOCUMENT_TYPES.map((dt) => (
            <SelectItem key={dt.value} value={dt.value}>
              {dt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(v: string) => onChange({ ...filters, status: v as DocumentStatus | "all" })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ search: "", documentType: "all", status: "all" })}
          className="gap-1 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
