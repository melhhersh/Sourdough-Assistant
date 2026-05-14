# PM Deliverables — Sourdough Assistant

---

## Artifact 1: Onboarding Reflection (Capture Log)

*Logged in real time while building the agent.*

### What was easy

- **Data model design.** The split between `troubleshooting` and `recipe` entries was natural and let a single retrieval pipeline serve both modes. No schema gymnastics required.
- **OpenRouter integration.** Dropping in the OpenRouter provider and switching models via a header took about 10 minutes once the correct npm package (`@openrouter/ai-sdk-provider`, not `@ai-sdk/openrouter`) was found.
- **In-memory retrieval.** Cosine similarity over precomputed embeddings is fast, zero-dependency, and trivially verifiable via the smoke test script. No vector DB cold-start friction.

### What was surprisingly hard

| Pain point | Time lost | Root cause |
|---|---|---|
| `@ai-sdk/openrouter` doesn't exist | ~20 min | Package name mismatch in PLAN.md vs npm registry |
| AI SDK v5 → v6 breaking changes | ~90 min | `toDataStreamResponse()` → `toUIMessageStreamResponse()`, `useChat` lost `handleSubmit`/`handleInputChange`/`headers` prop, `convertToModelMessages()` became async, `maxSteps` → `stopWhen: stepCountIs()`, tool `parameters` → `inputSchema: zodSchema()` |
| `tsc` binary symlink broken | ~10 min | Node v24 changed symlink resolution; workaround: `node node_modules/typescript/lib/tsc.js` |
| Instrumentation hook config removed | ~5 min | `experimental.instrumentationHook` was removed in Next.js 16; the hook runs by default now |

### Time to first trace
Approximately 45 minutes from starting Phase 1.2 to having a working instrumentation file that compiles. Actual Phoenix trace verification requires live API keys — add ~10 min for that step.

### Key insight for the Arize team
**The AI SDK v6 upgrade changed nearly every integration surface.** The official Arize docs (and the PLAN.md I wrote before starting) assumed v5 API shapes. Any new user following a tutorial written for AI SDK v4/v5 will hit all of these errors. A versioned "Phoenix + Vercel AI SDK v6" quickstart would eliminate 90+ minutes of friction for new users.

---

## Artifact 2: Product Proposal

### Proposal: "Eval Snapshot" — One-Click Regression Detection on Every Deploy

**Problem:** Teams using Arize to track LLM quality today run evals manually (notebook, CI script) and push results back to Phoenix as named experiments. This workflow breaks down as the team grows: eval runs happen inconsistently, regressions slip through between deploys, and there's no automated gate.

**Proposed feature:** An Arize-native GitHub Action (or Vercel integration) that:
1. On every PR/deploy, automatically runs the project's registered golden dataset against the new prompt/model version
2. Compares eval scores to the last-merged baseline
3. Posts a summary comment to the PR: "Faithfulness: 84% → 91% ✓ | Clarification: 72% → 68% ⚠"
4. Optionally blocks merge if any evaluator regresses past a configurable threshold

**Why now:** Vercel AI SDK v6 is shipping with first-class telemetry hooks and `toUIMessageStreamResponse()`. Phoenix already captures every trace. The missing piece is closing the loop back into the deploy gate — turning Arize from a "look at this after the fact" tool into a "prevent this before it ships" tool.

**User story:** *As a PM at a startup using OpenRouter + Next.js, I want to know before I merge a system-prompt change that my faithfulness score didn't drop — without having to manually re-run a Jupyter notebook.*

**Scope of MVP:**
- GitHub Action that calls the Phoenix API to run experiments on a named dataset
- A score-comparison report posted as a PR comment
- A configurable threshold config file (e.g., `arize.yaml`) checked into the repo

**Success metric:** Teams that adopt Eval Snapshot catch ≥1 regression per quarter that would otherwise have shipped. Measured via a post-deploy incident survey at the 90-day mark.

---

## Artifact 3: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Next.js)                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ useChat (AI SDK v6)          Sidebar                 │  │
│  │  sendMessage({ text })        ├── Recorded symptoms  │  │
│  │  DefaultChatTransport         └── Recipe step N/M    │  │
│  │  headers: x-model-id                                 │  │
│  │           x-openrouter-key   ModelSelector           │  │
│  │                              ApiKeyPanel             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ POST /api/chat (UIMessage stream)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Next.js API Route                          │
│                                                             │
│  streamText({                                               │
│    model: openrouter(modelId),                              │
│    stopWhen: stepCountIs(5),                                │
│    tools: { lookupKnowledge, recordSymptom,                 │
│             recordRecipeStep },                             │
│    experimental_telemetry: { metadata: {                    │
│      session_id, model_id, key_source } }                   │
│  })                                                         │
│                                                             │
│  toUIMessageStreamResponse()  ──────────────────────────┐  │
└──────────┬──────────────────────────────────────────────│──┘
           │                                              │
           │ tool: lookupKnowledge                        │ OpenTelemetry
           ▼                                              ▼
┌──────────────────────┐              ┌──────────────────────────┐
│ lib/knowledge-base   │              │ Arize Phoenix Cloud       │
│                      │              │                           │
│ cosine similarity    │              │ LLM spans                 │
│ over precomputed     │              │ Tool call spans           │
│ embeddings           │              │ Custom attributes:        │
│                      │              │   session_id              │
│ sourdough-           │              │   model_id                │
│ knowledge.json       │              │   key_source              │
│ sourdough-           │              │   symptom (per call)      │
│ recipes.json         │              │   recipe_step             │
│ sourdough-           │              │                           │
│ embeddings.json      │              │ ← eval experiments        │
└──────────────────────┘              └──────────────────────────┘
           ▲
           │ embed(query) via text-embedding-3-small
           │
┌──────────────────────┐
│ OpenAI Embeddings    │
│ text-embedding-      │
│ 3-small              │
└──────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Eval Pipeline (Python)                    │
│                                                             │
│  golden-dataset.json (29 scenarios)                         │
│    ├── 20 troubleshooting (easy/medium/hard)                │
│    └── 9 recipe (easy/medium/hard)                          │
│                                                             │
│  sourdough_evals.ipynb                                      │
│    ├── run_scenario() → calls /api/chat                     │
│    ├── 6 evaluators (Claude as judge, temp=0)               │
│    │     mode_detection / diagnostic_accuracy /             │
│    │     recipe_accuracy / clarification_quality /          │
│    │     faithfulness / conciseness                         │
│    ├── Baseline → iter1 → iter2 comparison                  │
│    └── Cross-model comparison (5 OpenRouter models)         │
└─────────────────────────────────────────────────────────────┘
```

### Iteration loop narrative

| Commit | Change | Expected eval delta |
|---|---|---|
| Baseline | Sourdough persona, no retrieval constraint | faithfulness ~70% (hallucination baseline) |
| iter1 | Constrain answers to retrieved content only | faithfulness ↑ ~15-20% |
| iter2 | Require ≥2 symptoms before diagnosing | clarification_quality ↑ ~20%, diagnostic_accuracy holds |
