"use client";

const MODELS = [
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "google/gemini-flash-2.0", label: "Gemini Flash 2.0" },
  { id: "mistralai/mistral-small", label: "Mistral Small" },
];

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[#a0522d]">
        Model
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-white border border-[#e8d5b7] rounded-lg px-2.5 py-1.5 text-[#2c1a0e] focus:outline-none focus:ring-2 focus:ring-[#d4956a] focus:border-transparent transition-shadow cursor-pointer"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
