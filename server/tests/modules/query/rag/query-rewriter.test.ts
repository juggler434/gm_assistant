// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions
const { mockChat } = vi.hoisted(() => ({
  mockChat: vi.fn(),
}));

vi.mock("@/services/llm/service.js", () => ({
  LLMService: vi.fn(),
}));

import { rewriteQuery } from "@/modules/query/rag/query-rewriter.js";
import type { LLMService } from "@/services/llm/service.js";
import type { ConversationMessage } from "@/modules/query/rag/types.js";
import { LLMError } from "@/services/llm/errors.js";

function makeMockLLMService(): LLMService {
  return {
    chat: mockChat,
    generate: vi.fn(),
    generateStream: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
    providerName: "ollama",
    model: "llama3",
  } as unknown as LLMService;
}

describe("Query Rewriter", () => {
  let llmService: LLMService;

  beforeEach(() => {
    vi.clearAllMocks();
    llmService = makeMockLLMService();
  });

  it("should return the original question when no history is provided", async () => {
    const result = await rewriteQuery("What is the Dragon of Blackmoor?", undefined, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("What is the Dragon of Blackmoor?");
    }
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("should return the original question when history is empty", async () => {
    const result = await rewriteQuery("What is the Dragon of Blackmoor?", [], llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("What is the Dragon of Blackmoor?");
    }
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("should rewrite a follow-up question using conversation history", async () => {
    const history: ConversationMessage[] = [
      { role: "user", content: "Tell me about the Dragon of Blackmoor" },
      { role: "assistant", content: "The Dragon of Blackmoor is an ancient red dragon that lives in the volcanic mountains." },
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: { role: "assistant", content: "What are the weaknesses of the Dragon of Blackmoor?" },
        model: "llama3",
      },
    });

    const result = await rewriteQuery("What are its weaknesses?", history, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("What are the weaknesses of the Dragon of Blackmoor?");
    }
    expect(mockChat).toHaveBeenCalledOnce();

    // Verify the chat call includes system prompt, history, and rewrite instruction
    const chatCall = mockChat.mock.calls[0][0];
    expect(chatCall.messages).toHaveLength(4); // system + 2 history + rewrite instruction
    expect(chatCall.messages[0].role).toBe("system");
    expect(chatCall.messages[1].content).toBe("Tell me about the Dragon of Blackmoor");
    expect(chatCall.messages[2].content).toContain("ancient red dragon");
    expect(chatCall.messages[3].content).toContain("What are its weaknesses?");
    expect(chatCall.temperature).toBe(0.1);
    expect(chatCall.maxTokens).toBe(200);
  });

  it("should fall back to the original question when LLM call fails", async () => {
    const history: ConversationMessage[] = [
      { role: "user", content: "Tell me about the Dragon of Blackmoor" },
      { role: "assistant", content: "The Dragon of Blackmoor is an ancient red dragon." },
    ];

    mockChat.mockResolvedValue({
      ok: false,
      error: new LLMError("Connection refused", "CONNECTION_ERROR", "ollama"),
    });

    const result = await rewriteQuery("What are its weaknesses?", history, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("What are its weaknesses?");
    }
  });

  it("should fall back to the original question when LLM returns empty text", async () => {
    const history: ConversationMessage[] = [
      { role: "user", content: "Tell me about goblins" },
      { role: "assistant", content: "Goblins are small creatures." },
    ];

    mockChat.mockResolvedValue({
      ok: true,
      value: {
        message: { role: "assistant", content: "   " },
        model: "llama3",
      },
    });

    const result = await rewriteQuery("Tell me more", history, llmService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("Tell me more");
    }
  });
});
