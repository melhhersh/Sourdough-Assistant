import embeddingsData from "../data/sourdough-embeddings.json";
import knowledgeData from "../data/sourdough-knowledge.json";
import recipesData from "../data/sourdough-recipes.json";

interface EmbeddingEntry {
  id: string;
  type: string;
  text: string;
  embedding: number[];
}

interface RecipeStep {
  step: number;
  title: string;
  description: string;
  duration?: string;
  temp?: string;
  visualCue?: string;
}

interface KnowledgeEntry {
  id: string;
  type: string;
  problem?: string;
  name?: string;
  description?: string;
  symptoms?: string;
  causes?: string[];
  fixes?: string[];
  ingredients?: Array<{ amount: string; item: string }>;
  steps?: RecipeStep[];
  tips?: string[];
  tags: string[];
}

interface RetrievalResult {
  id: string;
  type: string;
  score: number;
  entry: KnowledgeEntry;
}

const embeddings = embeddingsData as EmbeddingEntry[];
const knowledgeMap = new Map<string, KnowledgeEntry>(
  [...(knowledgeData as KnowledgeEntry[]), ...(recipesData as KnowledgeEntry[])].map(
    (e) => [e.id, e]
  )
);

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function getRecipeSummary(recipeId: string): { id: string; name: string; description: string; totalTime: string; activeTime: string; difficulty: string; ingredients: Array<{ amount: string; item: string }>; stepCount: number } | null {
  const entry = knowledgeMap.get(recipeId);
  if (!entry || entry.type !== "recipe") return null;
  const raw = entry as KnowledgeEntry & { totalTime?: string; activeTime?: string; difficulty?: string };
  return {
    id: entry.id,
    name: entry.name ?? recipeId,
    description: entry.description ?? "",
    totalTime: raw.totalTime ?? "",
    activeTime: raw.activeTime ?? "",
    difficulty: raw.difficulty ?? "",
    ingredients: entry.ingredients ?? [],
    stepCount: entry.steps?.length ?? 0,
  };
}

export function getRecipeStep(recipeId: string, stepNumber: number): RecipeStep | null {
  const entry = knowledgeMap.get(recipeId);
  if (!entry || !entry.steps) return null;
  return entry.steps.find((s) => s.step === stepNumber) ?? null;
}

export async function retrieveKnowledge(
  queryEmbedding: number[],
  topK = 3
): Promise<RetrievalResult[]> {
  const scored = embeddings.map((e) => ({
    id: e.id,
    type: e.type,
    score: cosineSimilarity(queryEmbedding, e.embedding),
    entry: knowledgeMap.get(e.id)!,
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.entry != null && r.score > 0.3);
}
