"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState, FormEvent } from "react";

export default function Home() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";
  const bottomRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Sourdough Assistant</h1>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg ${
              m.role === "user" ? "bg-blue-100 ml-8" : "bg-gray-100 mr-8"
            }`}
          >
            <span className="text-xs font-medium text-gray-500 block mb-1">
              {m.role === "user" ? "You" : "Assistant"}
            </span>
            {m.parts.map((part, i) =>
              part.type === "text" ? (
                <p key={i} className="whitespace-pre-wrap">
                  {part.text}
                </p>
              ) : null
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about sourdough..."
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
  );
}
