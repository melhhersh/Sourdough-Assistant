import { streamText, convertToModelMessages, UIMessage, tool, zodSchema, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { retrieveKnowledge } from "@/lib/knowledge-base";
import { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an expert sourdough baker and troubleshooting assistant. You help bakers diagnose what went wrong with their bread and guide them through sourdough recipes step by step.

First determine the user's intent:
- **Troubleshooting**: they describe a problem (bad crumb, failed starter, scoring issues, etc.)
- **Recipe**: they want to make something (a loaf, pancakes, crackers, etc.)

**Troubleshooting mode:**
- Call lookupKnowledge to search the knowledge base before answering.
- Use recordSymptom to record each distinct symptom the user reports (symptom + severity: low/moderate/high).
- Gather at least 1 symptom via recordSymptom before diagnosing.
- Reason step by step: identify the most likely cause, then recommend one primary fix with concrete details (temperatures in °F/°C, hydration percentages, feeding ratios, timing).
- Mention alternative causes if relevant.
- Be specific — "move to 78°F/26°C" is better than "find a warmer spot."

**Recipe mode:**
- Call lookupKnowledge to find the right recipe before answering.
- Use recordRecipeStep to track which step the user is on (recipeId, stepNumber, stepTitle).
- Walk through the recipe step by step, one step at a time unless they ask for the full recipe.
- Answer questions about timing, technique, and visual cues.
- Proactively surface relevant troubleshooting tips where the user might run into issues (mention the related troubleshooting entry ID if relevant).

Always call lookupKnowledge before answering any sourdough question. Base your answer on the retrieved entries. Maintain the persona of a patient, knowledgeable sourdough mentor.`;

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const sessionId: string = body.id ?? "unknown";

  const modelId = req.headers.get("x-model-id") ?? DEFAULT_MODEL;
  const userKey = req.headers.get("x-openrouter-key");

  const openrouter = createOpenRouter({
    apiKey: userKey ?? process.env.OPENROUTER_API_KEY,
  });

  const embeddingModel = openai.embedding("text-embedding-3-small");

  const result = streamText({
    model: openrouter(modelId),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      lookupKnowledge: tool({
        description:
          "Search the sourdough knowledge base for troubleshooting entries and recipes. Call this before answering any sourdough question.",
        inputSchema: zodSchema(
          z.object({
            query: z
              .string()
              .describe(
                "The search query — describe the problem or recipe the user is asking about."
              ),
          })
        ),
        execute: async ({ query }: { query: string }) => {
          const { embedding } = await embed({ model: embeddingModel, value: query });
          const results = await retrieveKnowledge(embedding, 3);
          return results.map((r) => ({
            id: r.id,
            type: r.type,
            score: Math.round(r.score * 10000) / 10000,
            entry: r.entry,
          }));
        },
      }),
      recordSymptom: tool({
        description:
          "Record a symptom the user has described in troubleshooting mode. Call once per distinct symptom before diagnosing.",
        inputSchema: zodSchema(
          z.object({
            symptom: z
              .string()
              .describe("A short description of the symptom, e.g. 'gummy crumb'."),
            severity: z
              .enum(["low", "moderate", "high"])
              .describe("How severe the symptom appears based on the user's description."),
          })
        ),
        execute: async ({ symptom, severity }: { symptom: string; severity: string }) => {
          return { recorded: true, symptom, severity };
        },
      }),
      recordRecipeStep: tool({
        description:
          "Track which recipe step the user is on in recipe mode. Call when the user begins or asks about a specific step.",
        inputSchema: zodSchema(
          z.object({
            recipeId: z
              .string()
              .describe("The ID of the recipe from the knowledge base, e.g. 'classic-country-sourdough'."),
            stepNumber: z.number().describe("The 1-based step number the user is currently on."),
            stepTitle: z.string().optional().describe("The title of the step, e.g. 'Autolyse'."),
            userQuestion: z
              .string()
              .optional()
              .describe("The user's question or concern about this step."),
          })
        ),
        execute: async ({
          recipeId,
          stepNumber,
          stepTitle,
          userQuestion,
        }: {
          recipeId: string;
          stepNumber: number;
          stepTitle?: string;
          userQuestion?: string;
        }) => {
          return { recorded: true, recipeId, stepNumber, stepTitle, userQuestion };
        },
      }),
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: "sourdough-chat",
      metadata: {
        session_id: sessionId,
        model_id: modelId,
        key_source: userKey ? "user" : "fallback",
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
