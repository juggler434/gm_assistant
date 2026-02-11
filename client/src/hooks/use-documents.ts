import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  DocumentListResponse,
  DocumentResponse,
  DocumentDownloadResponse,
  DocumentListQuery,
  DocumentType,
} from "@/types";

export const documentKeys = {
  all: (campaignId: string) => ["campaigns", campaignId, "documents"] as const,
  detail: (campaignId: string, id: string) => ["campaigns", campaignId, "documents", id] as const,
  download: (campaignId: string, id: string) =>
    ["campaigns", campaignId, "documents", id, "download"] as const,
};

function buildDocumentQueryString(params?: DocumentListQuery): string {
  if (!params) return "";
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.documentType) search.set("documentType", params.documentType);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function useDocuments(campaignId: string, params?: DocumentListQuery) {
  return useQuery({
    queryKey: [...documentKeys.all(campaignId), params],
    queryFn: () =>
      api.get<DocumentListResponse>(
        `/api/campaigns/${campaignId}/documents${buildDocumentQueryString(params)}`
      ),
    select: (data) => data.documents,
  });
}

export function useDocument(campaignId: string, id: string) {
  return useQuery({
    queryKey: documentKeys.detail(campaignId, id),
    queryFn: () => api.get<DocumentResponse>(`/api/campaigns/${campaignId}/documents/${id}`),
    select: (data) => data.document,
  });
}

export function useDocumentDownloadUrl(campaignId: string, id: string) {
  return useQuery({
    queryKey: documentKeys.download(campaignId, id),
    queryFn: () =>
      api.get<DocumentDownloadResponse>(`/api/campaigns/${campaignId}/documents/${id}/download`),
    enabled: false, // Only fetch on demand
  });
}

interface UploadDocumentParams {
  campaignId: string;
  file: File;
  name: string;
  documentType: DocumentType;
  tags?: string[];
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, file, name, documentType, tags }: UploadDocumentParams) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("documentType", documentType);
      if (tags?.length) {
        formData.append("tags", JSON.stringify(tags));
      }
      return api.upload<DocumentResponse>(`/api/campaigns/${campaignId}/documents`, formData);
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(campaignId),
      });
    },
  });
}

interface DeleteDocumentParams {
  campaignId: string;
  id: string;
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, id }: DeleteDocumentParams) =>
      api.delete(`/api/campaigns/${campaignId}/documents/${id}`),
    onSuccess: (_data, { campaignId, id }) => {
      queryClient.removeQueries({
        queryKey: documentKeys.detail(campaignId, id),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(campaignId),
      });
    },
  });
}
