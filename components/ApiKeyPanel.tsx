"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "openrouter_api_key";

interface ApiKeyPanelProps {
  messageCount: number;
  onKeyChange: (key: string | null) => void;
}

export function ApiKeyPanel({ messageCount, onKeyChange }: ApiKeyPanelProps) {
  const [key, setKey] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setKey(stored);
      setSaved(true);
      onKeyChange(stored);
    }
  }, [onKeyChange]);

  function save() {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
      setSaved(true);
      onKeyChange(key.trim());
      setIsOpen(false);
    }
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    setKey("");
    setSaved(false);
    onKeyChange(null);
  }

  const maxFallback = parseInt(process.env.NEXT_PUBLIC_RATE_LIMIT_MAX ?? "10", 10);
  const fallbackUsed = messageCount;
  const usingUserKey = saved && key.trim().length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
          usingUserKey
            ? "bg-[#f0fdf4] border-[#bbf7d0] text-[#166534] hover:bg-[#dcfce7]"
            : "bg-white border-[#e8d5b7] text-[#6b3a1f] hover:bg-[#fdf3e3]"
        }`}
      >
        {usingUserKey
          ? "✓ Your key"
          : `${fallbackUsed}/${maxFallback} msgs`}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-9 z-20 bg-white border border-[#e8d5b7] rounded-2xl shadow-xl p-4 w-72">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🔑</span>
              <p className="text-sm font-semibold text-[#2c1a0e]">OpenRouter API Key</p>
            </div>
            <p className="text-xs text-[#a0522d] mb-3 leading-relaxed">
              Paste your own key for unlimited messages. Stored in localStorage only.
            </p>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full text-xs bg-[#fdf8f0] border border-[#e8d5b7] rounded-lg px-3 py-2 mb-3 text-[#2c1a0e] placeholder-[#c8956c] focus:outline-none focus:ring-2 focus:ring-[#d4956a] focus:border-transparent transition-shadow"
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={!key.trim()}
                className="flex-1 text-xs px-3 py-2 bg-[#8b4513] text-[#fef9f0] rounded-lg font-medium disabled:opacity-40 hover:bg-[#6b3a1f] transition-colors"
              >
                Save key
              </button>
              {saved && (
                <button
                  onClick={clear}
                  className="text-xs px-3 py-2 border border-[#fca5a5] rounded-lg text-[#991b1b] hover:bg-[#fee2e2] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
