import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { retrieveKnowledge } from "../lib/knowledge-base";

const queries = [
  "my bread crumb is gummy and underbaked",
  "starter is not rising after feeding",
  "I want to make a simple country sourdough loaf",
];

async function main() {
  const model = openai.embedding("text-embedding-3-small");

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    const { embedding } = await embed({ model, value: query });
    const results = await retrieveKnowledge(embedding, 3);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.type}] ${r.id} (score: ${r.score.toFixed(4)})`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
