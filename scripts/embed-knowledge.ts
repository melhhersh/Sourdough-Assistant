import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

interface TroubleshootingEntry {
  id: string;
  type: string;
  problem: string;
  symptoms: string;
  causes: string[];
  fixes: string[];
  tags: string[];
}

interface RecipeEntry {
  id: string;
  type: string;
  name: string;
  description: string;
  difficulty: string;
  steps: Array<{ step: number; title: string; description: string }>;
  tags: string[];
}

function troubleshootingText(entry: TroubleshootingEntry): string {
  return [
    `Problem: ${entry.problem}`,
    `Symptoms: ${entry.symptoms}`,
    `Causes: ${entry.causes.join("; ")}`,
    `Fixes: ${entry.fixes.join("; ")}`,
    `Tags: ${entry.tags.join(", ")}`,
  ].join("\n");
}

function recipeText(entry: RecipeEntry): string {
  const stepSummary = entry.steps
    .slice(0, 3)
    .map((s) => `${s.title}: ${s.description.substring(0, 100)}`)
    .join("; ");
  return [
    `Recipe: ${entry.name}`,
    `Description: ${entry.description}`,
    `Difficulty: ${entry.difficulty}`,
    `Steps (first 3): ${stepSummary}`,
    `Tags: ${entry.tags.join(", ")}`,
  ].join("\n");
}

async function main() {
  const model = openai.embedding("text-embedding-3-small");

  const knowledge: TroubleshootingEntry[] = JSON.parse(
    readFileSync(join(DATA_DIR, "sourdough-knowledge.json"), "utf-8")
  );
  const recipes: RecipeEntry[] = JSON.parse(
    readFileSync(join(DATA_DIR, "sourdough-recipes.json"), "utf-8")
  );

  const allEntries = [
    ...knowledge.map((e) => ({ id: e.id, type: e.type, text: troubleshootingText(e) })),
    ...recipes.map((e) => ({ id: e.id, type: e.type, text: recipeText(e) })),
  ];

  console.log(`Embedding ${allEntries.length} entries...`);

  const embeddings: Array<{ id: string; type: string; text: string; embedding: number[] }> = [];

  for (const entry of allEntries) {
    const { embedding } = await embed({ model, value: entry.text });
    embeddings.push({ id: entry.id, type: entry.type, text: entry.text, embedding });
    process.stdout.write(".");
  }

  console.log("\nDone.");

  const outPath = join(DATA_DIR, "sourdough-embeddings.json");
  writeFileSync(outPath, JSON.stringify(embeddings, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
