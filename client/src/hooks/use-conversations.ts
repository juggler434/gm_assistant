import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  ConversationListResponse,
  ConversationDetailResponse,
  CreateConversationResponse,
} from "@/types";

export const conversationKeys = {
  all: (campaignId: string) => ["conversations", campaignId] as const,
  detail: (campaignId: string, conversationId: string) =>
    ["conversations", campaignId, conversationId] as const,
};

export function useConversations(campaignId: string | undefined) {
  return useQuery({
    queryKey: conversationKeys.all(campaignId!),
    queryFn: () => api.get<ConversationListResponse>(`/api/campaigns/${campaignId}/conversations`),
    select: (data) => data.conversations,
    enabled: !!campaignId,
  });
}

export function useConversationDetail(
  campaignId: string | undefined,
  conversationId: string | undefined
) {
  return useQuery({
    queryKey: conversationKeys.detail(campaignId!, conversationId!),
    queryFn: () =>
      api.get<ConversationDetailResponse>(
        `/api/campaigns/${campaignId}/conversations/${conversationId}`
      ),
    select: (data) => data.conversation,
    enabled: !!campaignId && !!conversationId,
  });
}

interface CreateConversationParams {
  campaignId: string;
  title: string;
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, title }: CreateConversationParams) =>
      api.post<CreateConversationResponse>(`/api/campaigns/${campaignId}/conversations`, { title }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.all(variables.campaignId),
      });
    },
  });
}

interface AddMessagesParams {
  campaignId: string;
  conversationId: string;
  messages: {
    role: "user" | "assistant";
    content: string;
    sources?: import("@/types").AnswerSource[] | null;
    confidence?: import("@/types").ConfidenceLevel | null;
  }[];
}

export function useAddMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, conversationId, messages }: AddMessagesParams) =>
      api.post(`/api/campaigns/${campaignId}/conversations/${conversationId}/messages`, {
        messages,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.all(variables.campaignId),
      });
    },
  });
}
