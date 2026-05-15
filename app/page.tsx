"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, FormEvent, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Sidebar } from "@/components/Sidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";

const DEFAULT_MODEL = "deepseek/deepseek-chat";

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
        prepareSendMessagesRequest: ({ id, messages, body, headers }) => ({
          body: { ...body, id, messages },
          headers: { ...(headers as Record<string, string>), ...headersRef.current },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, error } = useChat({ transport });
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
    <div className="flex h-screen bg-[#fdf8f0]">
      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#e8d5b7] bg-[#fef9f0]/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-label="bread">🍞</span>
            <div>
              <h1 className="text-base font-semibold text-[#2c1a0e] tracking-tight leading-none">
                Sourdough Assistant
              </h1>
              <p className="text-[10px] text-[#a0522d] mt-0.5 font-medium uppercase tracking-widest">
                Artisan bread guidance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModelSelector value={modelId} onChange={setModelId} />
            <ApiKeyPanel messageCount={userMessageCount} onKeyChange={setUserKey} />
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🌾</div>
                <p className="text-[#a0522d] font-medium">Ask me anything about sourdough.</p>
                <p className="text-[#c8956c] text-sm mt-1">Starters, hydration, baking schedules — I&apos;ve got you.</p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id}>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={i}
                        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}
                      >
                        <div
                          className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                            isUser
                              ? "bg-[#8b4513] text-[#fef9f0] rounded-br-sm shadow-sm"
                              : "bg-white border border-[#e8d5b7] text-[#2c1a0e] rounded-bl-sm shadow-sm"
                          }`}
                        >
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-widest block mb-1.5 ${
                              isUser ? "text-[#f5c97a]" : "text-[#a0522d]"
                            }`}
                          >
                            {isUser ? "You" : "Baker Bot"}
                          </span>
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{part.text}</p>
                          ) : (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                                li: ({ children }) => <li>{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold text-[#6b3a1f]">{children}</strong>,
                                code: ({ children }) => <code className="bg-[#f5ece0] rounded px-1 py-0.5 text-xs font-mono text-[#8b4513]">{children}</code>,
                                pre: ({ children }) => <pre className="bg-[#f5ece0] rounded-lg p-3 text-xs font-mono overflow-x-auto mb-2 border border-[#e8d5b7]">{children}</pre>,
                                h1: ({ children }) => <h1 className="font-bold text-base mb-1 text-[#2c1a0e]">{children}</h1>,
                                h2: ({ children }) => <h2 className="font-bold text-sm mb-1 text-[#2c1a0e]">{children}</h2>,
                                h3: ({ children }) => <h3 className="font-semibold text-sm mb-1 text-[#6b3a1f]">{children}</h3>,
                              }}
                            >
                              {part.text}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const label = TOOL_LABELS[part.type];
                  if (label) {
                    const isDone = "state" in part && part.state === "output-available";
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs text-[#a0522d] py-1 px-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isDone ? "bg-[#6b8f3e]" : "bg-[#f5c97a] animate-pulse"
                          }`}
                        />
                        <span className={isDone ? "text-[#6b8f3e]" : "text-[#c8956c]"}>
                          {isDone ? `${label} ✓` : `${label}…`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ))}

            {error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-sm bg-[#fef2f2] border border-[#fca5a5] text-[#991b1b] text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5 text-[#dc2626]">Error</span>
                  {error.message}
                </div>
              </div>
            )}

            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs text-[#c8956c] py-1 px-1">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4956a] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4956a] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4956a] animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                <span>Proofing a response…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 pb-5 pt-3 border-t border-[#e8d5b7] bg-[#fef9f0]/80 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl mx-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about sourdough…"
              className="flex-1 bg-white border border-[#e8d5b7] rounded-xl px-4 py-2.5 text-sm text-[#2c1a0e] placeholder-[#c8956c] focus:outline-none focus:ring-2 focus:ring-[#d4956a] focus:border-transparent transition-shadow"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-5 py-2.5 bg-[#8b4513] text-[#fef9f0] rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-[#6b3a1f] active:scale-95 transition-all shadow-sm"
            >
              {isLoading ? "…" : "Send"}
            </button>
          </form>
        </div>
      </div>

      <Sidebar messages={messages} />
    </div>
  );
}
