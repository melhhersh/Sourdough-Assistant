import { streamText, convertToModelMessages, UIMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const result = streamText({
    model: openrouter(DEFAULT_MODEL),
    system: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
    experimental_telemetry: { isEnabled: true, functionId: "sourdough-chat" },
  });

  return result.toUIMessageStreamResponse();
}
