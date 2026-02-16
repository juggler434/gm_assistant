import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import {
  conversationKeys,
  useConversations,
  useConversationDetail,
  useCreateConversation,
  useAddMessages,
} from "../use-conversations";

// Mock the api client
vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";

// Helper to create a fresh QueryClient + wrapper for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { wrapper: Wrapper, queryClient };
}

describe("conversationKeys", () => {
  it("should create correct all key", () => {
    expect(conversationKeys.all("campaign-1")).toEqual(["conversations", "campaign-1"]);
  });

  it("should create correct detail key", () => {
    expect(conversationKeys.detail("campaign-1", "conv-1")).toEqual([
      "conversations",
      "campaign-1",
      "conv-1",
    ]);
  });
});

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch conversations for a campaign", async () => {
    const mockData = {
      conversations: [
        {
          id: "conv-1",
          campaignId: "campaign-1",
          userId: "user-1",
          title: "Strahd's weaknesses",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
    };
    vi.mocked(api.get).mockResolvedValue(mockData);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversations("campaign-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData.conversations);
    expect(api.get).toHaveBeenCalledWith("/api/campaigns/campaign-1/conversations");
  });

  it("should not fetch when campaignId is undefined", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversations(undefined), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("should select the conversations array from the response", async () => {
    const mockData = {
      conversations: [
        {
          id: "conv-1",
          campaignId: "campaign-1",
          userId: "user-1",
          title: "Query 1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "conv-2",
          campaignId: "campaign-1",
          userId: "user-1",
          title: "Query 2",
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ],
    };
    vi.mocked(api.get).mockResolvedValue(mockData);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversations("campaign-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].title).toBe("Query 1");
    expect(result.current.data![1].title).toBe("Query 2");
  });

  it("should handle API errors", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Network error"));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversations("campaign-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});

describe("useConversationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch a conversation with messages", async () => {
    const mockData = {
      conversation: {
        id: "conv-1",
        campaignId: "campaign-1",
        userId: "user-1",
        title: "Strahd's weaknesses",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        messages: [
          {
            id: "msg-1",
            conversationId: "conv-1",
            role: "user",
            content: "What are Strahd's weaknesses?",
            sources: null,
            confidence: null,
            createdAt: "2024-01-01T00:00:00Z",
          },
          {
            id: "msg-2",
            conversationId: "conv-1",
            role: "assistant",
            content: "Strahd has several weaknesses...",
            sources: [
              {
                documentName: "module.pdf",
                documentId: "doc-1",
                documentType: "rulebook",
                pageNumber: 234,
                section: null,
                relevanceScore: 0.92,
              },
            ],
            confidence: "high",
            createdAt: "2024-01-01T00:00:01Z",
          },
        ],
      },
    };
    vi.mocked(api.get).mockResolvedValue(mockData);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationDetail("campaign-1", "conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData.conversation);
    expect(result.current.data!.messages).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("/api/campaigns/campaign-1/conversations/conv-1");
  });

  it("should not fetch when campaignId is undefined", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationDetail(undefined, "conv-1"), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("should not fetch when conversationId is undefined", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationDetail("campaign-1", undefined), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("should not fetch when both are undefined", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationDetail(undefined, undefined), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a conversation and invalidate the list cache", async () => {
    const mockResponse = {
      conversation: {
        id: "new-conv",
        campaignId: "campaign-1",
        userId: "user-1",
        title: "New query",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    };
    vi.mocked(api.post).mockResolvedValue(mockResponse);

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        campaignId: "campaign-1",
        title: "New query",
      });
    });

    expect(api.post).toHaveBeenCalledWith("/api/campaigns/campaign-1/conversations", {
      title: "New query",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversations", "campaign-1"],
    });
  });

  it("should propagate errors from the API", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          campaignId: "campaign-1",
          title: "New query",
        });
      })
    ).rejects.toThrow("Server error");
  });
});

describe("useAddMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add messages and invalidate the list cache", async () => {
    const mockResponse = {
      messages: [
        {
          id: "msg-1",
          conversationId: "conv-1",
          role: "user",
          content: "Hello",
          sources: null,
          confidence: null,
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    };
    vi.mocked(api.post).mockResolvedValue(mockResponse);

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddMessages(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        campaignId: "campaign-1",
        conversationId: "conv-1",
        messages: [{ role: "user", content: "Hello" }],
      });
    });

    expect(api.post).toHaveBeenCalledWith(
      "/api/campaigns/campaign-1/conversations/conv-1/messages",
      { messages: [{ role: "user", content: "Hello" }] }
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversations", "campaign-1"],
    });
  });

  it("should send user and assistant messages together", async () => {
    vi.mocked(api.post).mockResolvedValue({ messages: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddMessages(), { wrapper });

    const messages = [
      { role: "user" as const, content: "What are Strahd's weaknesses?" },
      {
        role: "assistant" as const,
        content: "Strahd has several weaknesses...",
        sources: [
          {
            documentName: "module.pdf",
            documentId: "doc-1",
            documentType: "rulebook",
            pageNumber: 234,
            section: null,
            relevanceScore: 0.92,
          },
        ],
        confidence: "high" as const,
      },
    ];

    await act(async () => {
      await result.current.mutateAsync({
        campaignId: "campaign-1",
        conversationId: "conv-1",
        messages,
      });
    });

    expect(api.post).toHaveBeenCalledWith(
      "/api/campaigns/campaign-1/conversations/conv-1/messages",
      { messages }
    );
  });

  it("should propagate errors from the API", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Failed to save"));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddMessages(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          campaignId: "campaign-1",
          conversationId: "conv-1",
          messages: [{ role: "user", content: "Hello" }],
        });
      })
    ).rejects.toThrow("Failed to save");
  });
});
