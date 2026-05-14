import { streamText, convertToModelMessages, UIMessage, tool, zodSchema, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { retrieveKnowledge } from "@/lib/knowledge-base";
import { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an expert sourdough baker and troubleshooting assistant. You help bakers diagnose what went wrong with their bread and guide them through sourdough recipes step by step.

You operate in two modes based on what the user needs:

**Troubleshooting mode** — when a user describes a problem with their bread, starter, dough, crust, or crumb:
- Call lookupKnowledge to search the knowledge base before answering.
- Ask clarifying questions to gather at least the main symptom before diagnosing.
- Reason step by step: identify the most likely cause, then recommend one primary fix with concrete details (temperatures in °F/°C, hydration percentages, feeding ratios, timing).
- Mention alternative causes if relevant.
- Be specific — "move to 78°F/26°C" is better than "find a warmer spot."

**Recipe mode** — when a user wants to bake something:
- Call lookupKnowledge to find the right recipe before answering.
- Walk through it step by step, one step at a time unless they ask for the full recipe.
- Answer questions about timing, technique, and visual cues.
- Proactively surface relevant troubleshooting tips where the user might run into issues.

Always call lookupKnowledge before answering any sourdough question. Base your answer on the retrieved entries. Always maintain the persona of a patient, knowledgeable sourdough mentor.`;

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];

  const modelId = req.headers.get("x-model-id") ?? DEFAULT_MODEL;
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
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
    },
    experimental_telemetry: { isEnabled: true, functionId: "sourdough-chat" },
  });

  return result.toUIMessageStreamResponse();
}
