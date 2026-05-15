import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI SDK modules
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn(),
    convertToModelMessages: vi.fn().mockResolvedValue([{ role: "user", content: "hello" }]),
    embed: vi.fn().mockResolvedValue({ embedding: [1, 0, 0] }),
    tool: vi.fn((def) => def),
    zodSchema: vi.fn((schema) => schema),
    stepCountIs: vi.fn(() => () => false),
  };
});

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => vi.fn(() => ({ provider: "openrouter" }))),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    embedding: vi.fn(() => ({ model: "text-embedding-3-small" })),
  })),
}));

vi.mock("@/lib/knowledge-base", () => ({
  retrieveKnowledge: vi.fn().mockResolvedValue([]),
  getRecipeSummary: vi.fn().mockReturnValue(null),
  getRecipeStep: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/personalities", () => ({
  PERSONALITIES: [
    {
      id: "sassy-mentor",
      label: "Sassy Mentor",
      tone: "You are sassy.",
    },
    {
      id: "grandma",
      label: "Grandma",
      tone: "You are warm.",
    },
  ],
}));

import { streamText, convertToModelMessages } from "ai";
import { POST } from "./route";

const mockToUIMessageStreamResponse = vi.fn(() => new Response("stream", { status: 200 }));

function makeRequest(
  messages: unknown[],
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {}
) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages, id: "test-session", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    toUIMessageStreamResponse: mockToUIMessageStreamResponse,
  });
});

describe("POST /api/chat", () => {
  describe("empty messages guard", () => {
    it("returns 400 when messages array is empty", async () => {
      const req = makeRequest([]);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("No messages provided");
    });

    it("returns 400 when messages key is missing", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "session" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("convertToModelMessages error handling", () => {
    it("returns 400 when message conversion fails", async () => {
      (convertToModelMessages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("conversion error")
      );
      const req = makeRequest([{ id: "1", role: "user", content: "hello", parts: [{ type: "text", text: "hello" }] }]);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Failed to convert messages");
    });
  });

  describe("successful request", () => {
    it("calls streamText and returns the stream response", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "hello", parts: [{ type: "text", text: "hello" }] },
      ]);
      const res = await POST(req);
      expect(streamText).toHaveBeenCalledOnce();
      expect(mockToUIMessageStreamResponse).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it("passes the system prompt to streamText", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "hello", parts: [{ type: "text", text: "hello" }] },
      ]);
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.system).toContain("sourdough baker");
    });
  });

  describe("header extraction", () => {
    it("uses default model when x-model-id header is absent", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] },
      ]);
      await POST(req);
      // streamText is called — just verify it was called (model is an opaque object)
      expect(streamText).toHaveBeenCalledOnce();
    });

    it("uses personality from x-personality-id header", async () => {
      const req = makeRequest(
        [{ id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }],
        { "x-personality-id": "grandma" }
      );
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.system).toContain("You are warm.");
    });

    it("falls back to first personality when x-personality-id is unknown", async () => {
      const req = makeRequest(
        [{ id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }],
        { "x-personality-id": "unknown-id" }
      );
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.system).toContain("You are sassy.");
    });
  });

  describe("message normalization", () => {
    it("adds parts to messages that are missing them", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "plain content without parts" },
      ]);
      await POST(req);
      expect(convertToModelMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            parts: [{ type: "text", text: "plain content without parts" }],
          }),
        ])
      );
    });

    it("does not modify messages that already have parts", async () => {
      const existingParts = [{ type: "text" as const, text: "hello" }];
      const req = makeRequest([
        { id: "1", role: "user", content: "hello", parts: existingParts },
      ]);
      await POST(req);
      expect(convertToModelMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ parts: existingParts }),
        ])
      );
    });
  });

  describe("streamText configuration", () => {
    it("sets maxOutputTokens to 512", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] },
      ]);
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.maxOutputTokens).toBe(512);
    });

    it("includes all 5 tools", async () => {
      const req = makeRequest([
        { id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] },
      ]);
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.tools).toHaveProperty("lookupKnowledge");
      expect(callArgs.tools).toHaveProperty("recordSymptom");
      expect(callArgs.tools).toHaveProperty("recordRecipeStep");
      expect(callArgs.tools).toHaveProperty("getRecipeSummary");
      expect(callArgs.tools).toHaveProperty("getRecipeStep");
    });

    it("passes session ID in telemetry metadata", async () => {
      const req = makeRequest(
        [{ id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }],
        {},
        { id: "my-session-123" }
      );
      await POST(req);
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.experimental_telemetry.metadata.session_id).toBe("my-session-123");
    });
  });
});
