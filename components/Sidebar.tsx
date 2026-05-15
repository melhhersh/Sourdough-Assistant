"use client";

import { UIMessage } from "ai";

interface Symptom {
  symptom: string;
  severity: "low" | "moderate" | "high";
}

interface RecipeStepRecord {
  recipeId: string;
  stepNumber: number;
  stepTitle?: string;
}

interface SidebarProps {
  messages: UIMessage[];
}

function extractSymptoms(messages: UIMessage[]): Symptom[] {
  const symptoms: Symptom[] = [];
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type === "tool-recordSymptom" &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part &&
        part.output
      ) {
        const output = part.output as { symptom: string; severity: string };
        symptoms.push({
          symptom: output.symptom,
          severity: output.severity as "low" | "moderate" | "high",
        });
      }
    }
  }
  return symptoms;
}

function extractRecipeStep(messages: UIMessage[]): RecipeStepRecord | null {
  let latest: RecipeStepRecord | null = null;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type === "tool-recordRecipeStep" &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part &&
        part.output
      ) {
        latest = part.output as RecipeStepRecord;
      }
    }
  }
  return latest;
}

const severityConfig: Record<string, { badge: string; dot: string }> = {
  low: {
    badge: "bg-[#fef9c3] text-[#854d0e] border border-[#fde68a]",
    dot: "bg-[#f5c97a]",
  },
  moderate: {
    badge: "bg-[#ffedd5] text-[#9a3412] border border-[#fed7aa]",
    dot: "bg-[#fb923c]",
  },
  high: {
    badge: "bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5]",
    dot: "bg-[#f87171]",
  },
};

export function Sidebar({ messages }: SidebarProps) {
  const symptoms = extractSymptoms(messages);
  const recipeStep = extractRecipeStep(messages);

  return (
    <aside className="w-64 border-l border-[#e8d5b7] bg-[#fef9f0] shrink-0 flex flex-col">
      {/* Sidebar header */}
      <div className="px-4 py-4 border-b border-[#e8d5b7]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a0522d]">
          Session Context
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {symptoms.length === 0 && !recipeStep && (
          <div className="text-center pt-8">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-xs text-[#c8956c] leading-relaxed">
              Symptoms and recipe progress will appear here as you chat.
            </p>
          </div>
        )}

        {recipeStep && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a0522d] mb-2">
              Recipe Progress
            </p>
            <div className="bg-white border border-[#c8e6c9] rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🥖</span>
                <p className="font-semibold text-[#2c1a0e] text-sm truncate">{recipeStep.recipeId}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#6b8f3e] font-medium">Step {recipeStep.stepNumber}</span>
                {recipeStep.stepTitle && (
                  <>
                    <span className="text-[#c8e6c9]">·</span>
                    <span className="text-xs text-[#6b8f3e] truncate">{recipeStep.stepTitle}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {symptoms.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a0522d] mb-2">
              Recorded Symptoms
            </p>
            <ul className="space-y-2">
              {symptoms.map((s, i) => {
                const config = severityConfig[s.severity] ?? severityConfig.low;
                return (
                  <li key={i} className="bg-white border border-[#e8d5b7] rounded-xl p-2.5 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${config.badge}`}>
                        {s.severity}
                      </span>
                    </div>
                    <p className="text-xs text-[#2c1a0e] leading-relaxed">{s.symptom}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
