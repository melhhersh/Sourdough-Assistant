import {
  streamText,
  convertToModelMessages,
  UIMessage,
  tool,
  zodSchema,
  stepCountIs,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { retrieveKnowledge, getRecipeSummary, getRecipeStep } from "@/lib/knowledge-base";
import { PERSONALITIES } from "@/lib/personalities";
import { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const SYSTEM_PROMPT_BODY = `You are an expert sourdough baker and troubleshooting assistant. You help bakers diagnose what went wrong with their bread and guide them through sourdough recipes step by step.

First determine the user's intent:
- **Troubleshooting**: they describe a problem (bad crumb, failed starter, scoring issues, etc.)
- **Recipe**: they want to make something (a loaf, pancakes, crackers, etc.)

**Troubleshooting mode:**
- Call lookupKnowledge to search the knowledge base before answering.
- Use recordSymptom to record each distinct symptom the user reports (symptom + severity: low/moderate/high).
- Gather at least 2 distinct symptoms via recordSymptom before diagnosing. If you only have 1 symptom, ask one targeted clarifying question to identify a second symptom before committing to a diagnosis.
- Reason step by step: identify the most likely cause, then recommend one primary fix with concrete details (temperatures in °F/°C, hydration percentages, feeding ratios, timing).
- Mention alternative causes if relevant.
- Be specific — "move to 78°F/26°C" is better than "find a warmer spot."

**Recipe mode:**
- Call lookupKnowledge to find the right recipe ID, then use getRecipeSummary to get the recipe overview and ingredient list.
- Use getRecipeStep to fetch one step at a time — never load the full recipe at once.
- Use recordRecipeStep to track which step the user is on (recipeId, stepNumber, stepTitle).
- Walk through the recipe step by step, one step at a time unless they ask for the full recipe.
- Answer questions about timing, technique, and visual cues using getRecipeStep for the relevant step.

Always call lookupKnowledge before answering any sourdough question. Base your answer ONLY on the retrieved entries — do not add causes, fixes, or recipe steps that are not present in the retrieved results. If the retrieved entries do not contain the answer, say "I don't have specific guidance on that in my knowledge base" rather than guessing.`;

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const sessionId: string = body.id ?? "unknown";

  const modelId = req.headers.get("x-model-id") ?? DEFAULT_MODEL;
  const userKey = req.headers.get("x-openrouter-key");
  const personalityId = req.headers.get("x-personality-id") ?? PERSONALITIES[0].id;
  const personality = PERSONALITIES.find((p) => p.id === personalityId) ?? PERSONALITIES[0];
  const systemPrompt = `${personality.tone}\n\n${SYSTEM_PROMPT_BODY}`;

  console.log(
    `[chat] session=${sessionId} model=${modelId} personality=${personalityId} messages=${messages.length} key=${userKey ? "user" : "fallback"}`,
  );

  if (messages.length === 0) {
    console.error("[chat] Empty messages array received");
    return new Response(JSON.stringify({ error: "No messages provided" }), {
      status: 400,
    });
  }

  const openrouter = createOpenRouter({
    apiKey: userKey ?? process.env.OPENROUTER_API_KEY,
  });

  const openrouterOpenAI = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: userKey ?? process.env.OPENROUTER_API_KEY,
  });
  const embeddingModel = openrouterOpenAI.embedding(
    "openai/text-embedding-3-small",
  );

  const normalizedMessages: UIMessage[] = messages.map((m) =>
    m.parts
      ? m
      : { ...m, parts: [{ type: "text" as const, text: typeof m.content === "string" ? m.content : "" }] }
  );

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(normalizedMessages);
    console.log(`[chat] converted ${modelMessages.length} model messages`);
  } catch (err) {
    console.error("[chat] convertToModelMessages failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to convert messages" }),
      { status: 400 },
    );
  }

  const result = streamText({
    model: openrouter(modelId),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: 512,
    stopWhen: stepCountIs(8),
    onError: (err) => console.error("[chat] streamText error:", err),
    onFinish: ({ usage, finishReason }) =>
      console.log(
        `[chat] done finishReason=${finishReason} tokens=${JSON.stringify(usage)}`,
      ),
    tools: {
      lookupKnowledge: tool({
        description:
          "Search the sourdough knowledge base for troubleshooting entries and recipes. Call this before answering any sourdough question.",
        inputSchema: zodSchema(
          z.object({
            query: z
              .string()
              .describe(
                "The search query — describe the problem or recipe the user is asking about.",
              ),
          }),
        ),
        execute: async ({ query }: { query: string }) => {
          console.log(`[chat] lookupKnowledge query="${query}"`);
          const { embedding } = await embed({
            model: embeddingModel,
            value: query,
          });
          const results = await retrieveKnowledge(embedding, 2);
          console.log(
            `[chat] lookupKnowledge returned ${results.length} results: ${results.map((r) => r.id).join(", ")}`,
          );
          return results.map((r) => {
            const e = r.entry as Record<string, unknown>;
            const summary: Record<string, unknown> = {
              id: e.id,
              type: e.type,
              ...(e.problem ? { problem: e.problem } : {}),
              ...(e.name ? { name: e.name } : {}),
              ...(e.symptoms ? { symptoms: e.symptoms } : {}),
              ...(e.causes ? { causes: e.causes } : {}),
              ...(e.fixes ? { fixes: e.fixes } : {}),
              ...(e.description ? { description: e.description } : {}),
              ...(e.ingredients ? { ingredients: e.ingredients } : {}),
            };
            if (e.steps && Array.isArray(e.steps)) {
              summary.steps = (e.steps as Array<{ step: number; title: string; description: string }>).map(
                ({ step, title, description }) => ({ step, title, description })
              );
            }
            return { id: r.id, type: r.type, score: Math.round(r.score * 10000) / 10000, entry: summary };
          });
        },
      }),
      recordSymptom: tool({
        description:
          "Record a symptom the user has described in troubleshooting mode. Call once per distinct symptom before diagnosing.",
        inputSchema: zodSchema(
          z.object({
            symptom: z
              .string()
              .describe(
                "A short description of the symptom, e.g. 'gummy crumb'.",
              ),
            severity: z
              .enum(["low", "moderate", "high"])
              .describe(
                "How severe the symptom appears based on the user's description.",
              ),
          }),
        ),
        execute: async ({
          symptom,
          severity,
        }: {
          symptom: string;
          severity: string;
        }) => {
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
              .describe(
                "The ID of the recipe from the knowledge base, e.g. 'classic-country-sourdough'.",
              ),
            stepNumber: z
              .number()
              .describe("The 1-based step number the user is currently on."),
            stepTitle: z
              .string()
              .optional()
              .describe("The title of the step, e.g. 'Autolyse'."),
            userQuestion: z
              .string()
              .optional()
              .describe("The user's question or concern about this step."),
          }),
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
          return {
            recorded: true,
            recipeId,
            stepNumber,
            stepTitle,
            userQuestion,
          };
        },
      }),
      getRecipeSummary: tool({
        description:
          "Get the overview, ingredients, and step count for a recipe. Call this once at the start of recipe mode to orient the user — do NOT use this to read step content.",
        inputSchema: zodSchema(
          z.object({
            recipeId: z.string().describe("The recipe ID from the knowledge base."),
          })
        ),
        execute: async ({ recipeId }: { recipeId: string }) => {
          const summary = getRecipeSummary(recipeId);
          if (!summary) return { error: `Recipe '${recipeId}' not found.` };
          return summary;
        },
      }),
      getRecipeStep: tool({
        description:
          "Fetch a single step from a recipe by step number. Use this to present one step at a time instead of loading the full recipe.",
        inputSchema: zodSchema(
          z.object({
            recipeId: z.string().describe("The recipe ID from the knowledge base."),
            stepNumber: z.number().describe("The 1-based step number to retrieve."),
          })
        ),
        execute: async ({ recipeId, stepNumber }: { recipeId: string; stepNumber: number }) => {
          const step = getRecipeStep(recipeId, stepNumber);
          if (!step) return { error: `Step ${stepNumber} not found in recipe '${recipeId}'.` };
          return step;
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
