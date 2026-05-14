"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, FormEvent, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const TOOL_LABELS: Record<string, string> = {
  "tool-lookupKnowledge": "Searching knowledge base",
  "tool-recordSymptom": "Recording symptom",
  "tool-recordRecipeStep": "Tracking recipe step",
};

export default function Home() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [userKey, setUserKey] = useState<string | null>(null);

  const headersRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const headers: Record<string, string> = { "x-model-id": modelId };
    if (userKey) headers["x-openrouter-key"] = userKey;
    headersRef.current = headers;
  }, [modelId, userKey]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ body, headers }) => ({
          body: body ?? {},
          headers: { ...(headers as Record<string, string>), ...headersRef.current },
        }),
      }),
    []
  );

  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";
  const bottomRef = useRef<HTMLDivElement>(null);

  const userMessageCount = messages.filter((m) => m.role === "user").length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="flex h-screen">
      <div className="flex flex-col flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Sourdough Assistant</h1>
          <div className="flex items-center gap-3">
            <ModelSelector value={modelId} onChange={setModelId} />
            <ApiKeyPanel messageCount={userMessageCount} onKeyChange={setUserKey} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-w-2xl w-full mx-auto">
          {messages.map((m) => (
            <div key={m.id}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg mb-2 ${
                        m.role === "user" ? "bg-blue-100 ml-8" : "bg-gray-100 mr-8"
                      }`}
                    >
                      <span className="text-xs font-medium text-gray-500 block mb-1">
                        {m.role === "user" ? "You" : "Assistant"}
                      </span>
                      <p className="whitespace-pre-wrap">{part.text}</p>
                    </div>
                  );
                }
                const label = TOOL_LABELS[part.type];
                if (label) {
                  const isDone =
                    "state" in part && part.state === "output-available";
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-gray-500 py-1"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDone ? "bg-green-400" : "bg-yellow-400 animate-pulse"
                        }`}
                      />
                      {isDone ? `${label} ✓` : `${label}…`}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 max-w-2xl w-full mx-auto"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about sourdough…"
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {isLoading ? "…" : "Send"}
          </button>
        </form>
      </div>

      <Sidebar messages={messages} />
    </div>
  );
}
