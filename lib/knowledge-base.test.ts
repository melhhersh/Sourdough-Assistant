import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the large JSON data files before importing the module
vi.mock("../data/sourdough-embeddings.json", () => ({
  default: [
    {
      id: "dense-crumb",
      type: "troubleshooting",
      text: "dense crumb not enough oven spring",
      embedding: [1, 0, 0],
    },
    {
      id: "classic-country-sourdough",
      type: "recipe",
      text: "classic country sourdough recipe",
      embedding: [0, 1, 0],
    },
    {
      id: "gummy-crumb",
      type: "troubleshooting",
      text: "gummy crumb underbaked",
      embedding: [0.6, 0.8, 0],
    },
  ],
}));

vi.mock("../data/sourdough-knowledge.json", () => ({
  default: [
    {
      id: "dense-crumb",
      type: "troubleshooting",
      problem: "Dense crumb",
      symptoms: "No oven spring, tight crumb",
      causes: ["underproofed", "weak starter"],
      fixes: ["Extend bulk fermentation", "Feed starter more frequently"],
      tags: ["crumb", "proofing"],
    },
    {
      id: "gummy-crumb",
      type: "troubleshooting",
      problem: "Gummy crumb",
      symptoms: "Wet, gummy texture inside",
      causes: ["underbaked", "cut too soon"],
      fixes: ["Bake longer", "Wait 2 hours before slicing"],
      tags: ["crumb", "baking"],
    },
  ],
}));

vi.mock("../data/sourdough-recipes.json", () => ({
  default: [
    {
      id: "classic-country-sourdough",
      type: "recipe",
      name: "Classic Country Sourdough",
      description: "A timeless open-crumb loaf",
      totalTime: "24 hours",
      activeTime: "2 hours",
      difficulty: "intermediate",
      ingredients: [
        { amount: "500g", item: "bread flour" },
        { amount: "375g", item: "water" },
      ],
      steps: [
        {
          step: 1,
          title: "Autolyse",
          description: "Mix flour and water, rest 30 minutes.",
          duration: "30 min",
        },
        {
          step: 2,
          title: "Add Levain",
          description: "Add levain and salt, mix thoroughly.",
          duration: "15 min",
          temp: "78°F",
          visualCue: "Shaggy dough becomes smooth",
        },
      ],
      tips: ["Use a dutch oven"],
      tags: ["loaf", "beginner-friendly"],
    },
  ],
}));

// Import after mocks are set up
import { getRecipeSummary, getRecipeStep, retrieveKnowledge } from "./knowledge-base";

describe("getRecipeSummary", () => {
  it("returns summary for a valid recipe ID", () => {
    const summary = getRecipeSummary("classic-country-sourdough");
    expect(summary).not.toBeNull();
    expect(summary!.id).toBe("classic-country-sourdough");
    expect(summary!.name).toBe("Classic Country Sourdough");
    expect(summary!.description).toBe("A timeless open-crumb loaf");
    expect(summary!.totalTime).toBe("24 hours");
    expect(summary!.activeTime).toBe("2 hours");
    expect(summary!.difficulty).toBe("intermediate");
    expect(summary!.stepCount).toBe(2);
    expect(summary!.ingredients).toHaveLength(2);
  });

  it("returns null for an unknown ID", () => {
    expect(getRecipeSummary("nonexistent-recipe")).toBeNull();
  });

  it("returns null for a troubleshooting entry (wrong type)", () => {
    expect(getRecipeSummary("dense-crumb")).toBeNull();
  });

  it("includes ingredients array", () => {
    const summary = getRecipeSummary("classic-country-sourdough");
    expect(summary!.ingredients[0]).toEqual({ amount: "500g", item: "bread flour" });
  });
});

describe("getRecipeStep", () => {
  it("returns step 1 for a valid recipe", () => {
    const step = getRecipeStep("classic-country-sourdough", 1);
    expect(step).not.toBeNull();
    expect(step!.step).toBe(1);
    expect(step!.title).toBe("Autolyse");
    expect(step!.description).toBe("Mix flour and water, rest 30 minutes.");
    expect(step!.duration).toBe("30 min");
  });

  it("returns step 2 with optional fields", () => {
    const step = getRecipeStep("classic-country-sourdough", 2);
    expect(step).not.toBeNull();
    expect(step!.title).toBe("Add Levain");
    expect(step!.temp).toBe("78°F");
    expect(step!.visualCue).toBe("Shaggy dough becomes smooth");
  });

  it("returns null for a step number that does not exist", () => {
    expect(getRecipeStep("classic-country-sourdough", 99)).toBeNull();
  });

  it("returns null for an unknown recipe ID", () => {
    expect(getRecipeStep("nonexistent-recipe", 1)).toBeNull();
  });

  it("returns null for a troubleshooting entry with no steps", () => {
    expect(getRecipeStep("dense-crumb", 1)).toBeNull();
  });
});

describe("retrieveKnowledge", () => {
  it("returns the top-K results sorted by cosine similarity", async () => {
    // Query perfectly aligned with "dense-crumb" embedding [1, 0, 0]
    const results = await retrieveKnowledge([1, 0, 0], 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("dense-crumb");
    expect(results[0].score).toBeCloseTo(1.0, 3);
  });

  it("respects the topK limit", async () => {
    const results = await retrieveKnowledge([1, 0, 0], 1);
    expect(results).toHaveLength(1);
  });

  it("filters out results below the 0.3 score threshold", async () => {
    // Query orthogonal to all embeddings except gummy-crumb (dot product = 0 for [1,0,0] vs [0,1,0])
    // Use a query that scores near-zero for most
    const results = await retrieveKnowledge([0, 0, 1], 3);
    // [0,0,1] dot [1,0,0] = 0, dot [0,1,0] = 0, dot [0.6,0.8,0] = 0 — all below threshold
    expect(results).toHaveLength(0);
  });

  it("returns entries with associated knowledge data", async () => {
    const results = await retrieveKnowledge([1, 0, 0], 2);
    expect(results[0].entry).toBeDefined();
    expect(results[0].entry.id).toBe("dense-crumb");
  });

  it("scores are in descending order", async () => {
    // [0.6, 0.8, 0] will match gummy-crumb embedding [0.6, 0.8, 0] perfectly
    // and partially match dense-crumb [1,0,0] and recipe [0,1,0]
    const results = await retrieveKnowledge([0.6, 0.8, 0], 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("uses default topK of 3 when not specified", async () => {
    const results = await retrieveKnowledge([1, 0, 0]);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
