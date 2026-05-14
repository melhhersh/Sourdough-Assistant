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
        className="text-xs px-2 py-1 border rounded hover:bg-gray-50 transition-colors"
      >
        {usingUserKey
          ? "Using your key"
          : `Shared key (${fallbackUsed}/${maxFallback})`}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-8 z-10 bg-white border rounded-lg shadow-lg p-3 w-72">
          <p className="text-xs font-medium text-gray-700 mb-2">OpenRouter API Key</p>
          <p className="text-xs text-gray-500 mb-2">
            Paste your own key for unlimited messages. Stored in localStorage only.
          </p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-..."
            className="w-full text-xs border rounded px-2 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!key.trim()}
              className="flex-1 text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
            >
              Save
            </button>
            {saved && (
              <button
                onClick={clear}
                className="text-xs px-2 py-1 border rounded hover:bg-red-50 text-red-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
