"use client";

import { PERSONALITIES } from "@/lib/personalities";
export { PERSONALITIES };

interface PersonalitySelectorProps {
  value: string;
  onChange: (personalityId: string) => void;
}

export function PersonalitySelector({ value, onChange }: PersonalitySelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[#a0522d]">
        Vibe
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-white border border-[#e8d5b7] rounded-lg px-2.5 py-1.5 text-[#2c1a0e] focus:outline-none focus:ring-2 focus:ring-[#d4956a] focus:border-transparent transition-shadow cursor-pointer"
      >
        {PERSONALITIES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
