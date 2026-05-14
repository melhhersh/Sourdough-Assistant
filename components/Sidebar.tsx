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

const severityColor: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800",
  moderate: "bg-orange-100 text-orange-800",
  high: "bg-red-100 text-red-800",
};

export function Sidebar({ messages }: SidebarProps) {
  const symptoms = extractSymptoms(messages);
  const recipeStep = extractRecipeStep(messages);

  if (symptoms.length === 0 && !recipeStep) {
    return (
      <aside className="w-64 border-l p-4 text-sm text-gray-400 shrink-0">
        <p className="font-medium text-gray-600 mb-2">Session Context</p>
        <p>Symptoms and recipe progress will appear here as you chat.</p>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-l p-4 text-sm shrink-0">
      {recipeStep && (
        <div className="mb-4">
          <p className="font-medium text-gray-700 mb-2">Recipe Progress</p>
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <p className="font-medium text-green-800">{recipeStep.recipeId}</p>
            <p className="text-green-700">Step {recipeStep.stepNumber}</p>
            {recipeStep.stepTitle && (
              <p className="text-green-600 text-xs mt-1">{recipeStep.stepTitle}</p>
            )}
          </div>
        </div>
      )}

      {symptoms.length > 0 && (
        <div>
          <p className="font-medium text-gray-700 mb-2">Recorded Symptoms</p>
          <ul className="space-y-2">
            {symptoms.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${severityColor[s.severity] ?? ""}`}
                >
                  {s.severity}
                </span>
                <span className="text-gray-700">{s.symptom}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
