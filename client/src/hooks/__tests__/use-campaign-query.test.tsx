// SPDX-License-Identifier: AGPL-3.0-or-later

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useCampaignQuery } from "../use-campaign-query";

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

describe("useCampaignQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should post a query and return the response", async () => {
    const mockResponse = {
      answer: "Strahd has several weaknesses...",
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
    };
    vi.mocked(api.post).mockResolvedValue(mockResponse);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    let response: typeof mockResponse | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        campaignId: "campaign-1",
        query: "What are Strahd's weaknesses?",
      });
    });

    expect(api.post).toHaveBeenCalledWith("/api/campaigns/campaign-1/query", {
      query: "What are Strahd's weaknesses?",
    });
    expect(response).toEqual(mockResponse);
  });

  it("should pass filters to the API", async () => {
    vi.mocked(api.post).mockResolvedValue({
      answer: "Answer",
      sources: [],
      confidence: "low",
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        campaignId: "campaign-1",
        query: "Search question",
        filters: {
          documentTypes: ["rulebook"],
          tags: ["combat"],
        },
      });
    });

    expect(api.post).toHaveBeenCalledWith("/api/campaigns/campaign-1/query", {
      query: "Search question",
      filters: {
        documentTypes: ["rulebook"],
        tags: ["combat"],
      },
    });
  });

  it("should propagate errors from the API", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("RAG pipeline failed"));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          campaignId: "campaign-1",
          query: "Test query",
        });
      })
    ).rejects.toThrow("RAG pipeline failed");
  });

  it("should not be pending before any mutation", () => {
    vi.mocked(api.post).mockResolvedValue({
      answer: "Answer",
      sources: [],
      confidence: "low",
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isIdle).toBe(true);
  });

  it("should transition to success state after mutation completes", async () => {
    vi.mocked(api.post).mockResolvedValue({
      answer: "Done",
      sources: [],
      confidence: "low",
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    act(() => {
      result.current.mutate({
        campaignId: "campaign-1",
        query: "Test",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isPending).toBe(false);
  });

  it("should strip campaignId from the request body", async () => {
    vi.mocked(api.post).mockResolvedValue({
      answer: "Answer",
      sources: [],
      confidence: "low",
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampaignQuery(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        campaignId: "campaign-1",
        query: "My question",
      });
    });

    // campaignId should be in the URL, not in the body
    const [, body] = vi.mocked(api.post).mock.calls[0];
    expect(body).toEqual({ query: "My question" });
    expect(body).not.toHaveProperty("campaignId");
  });
});
