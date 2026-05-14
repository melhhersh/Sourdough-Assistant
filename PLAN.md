# Sourdough Assistant Agent — Architecture Plan

## Context
Building a sourdough assistant chat agent as part of an Arize take-home interview. The agent handles two modes: **troubleshooting** (diagnosing baking failures) and **recipe guidance** (walking users through sourdough recipes step by step). The goal is to demonstrate Arize's full developer workflow: tracing/observability, evals, prompt experiments, and dataset upload. The agent needs to be technically interesting enough to generate rich traces and meaningful eval scenarios — and the take-home is really evaluating whether we can run the **iteration loop** Arize is designed for: trace → identify failure → fix → re-eval → show improvement.

---

## Stack
- **Framework:** Next.js (App Router)
- **LLM orchestration:** Vercel AI SDK (`ai` package) with `streamText` + `useChat`
- **LLM provider:** OpenRouter (`@ai-sdk/openrouter`) — single API key, access to Claude, Gemini, Llama, Mistral, and more. Model is user-selectable at runtime.
- **Arize integration:** `@arizeai/openinference-vercel` + `@arizeai/phoenix-otel`
- **Embeddings:** Vercel AI SDK `embed()` with OpenAI `text-embedding-3-small`
- **Vector search:** In-memory cosine similarity over precomputed embeddings (no external DB)
- **Evals:** Traces collected in TypeScript → evals run in Python notebook

---

## Architecture

### 1. Knowledge Base

The knowledge base now covers two document types — **troubleshooting entries** (existing) and **recipe entries** (new). Both share the same embedding + retrieval pipeline; the `type` field distinguishes them so the agent can route to the right mode.

#### 1a. Troubleshooting Entries (`/data/sourdough-knowledge.json`)
- **Source data:** **21 entries** researched and cross-checked across The Perfect Loaf, The Sourdough Journey, The Pantry Mama, King Arthur Baking, Cultured.guru, Challenger Breadware, The Fresh Loaf, and Breadtopia.
- **Actual coverage (21 entries, all semantically distinct):**
  - **Starter (6):** `starter-sluggish-not-doubling`, `starter-acetone-nail-polish-smell`, `starter-hooch-liquid-layer`, `starter-pink-orange-serratia` (safety/discard), `starter-mold-fuzzy` (safety/discard), `new-starter-false-rise-leuconostoc`
  - **Dough/mixing (3):** `dough-too-sticky-slack`, `dough-too-stiff-dry`, `dough-tearing-during-shaping`
  - **Fermentation (4):** `bulk-underproofed`, `bulk-overproofed`, `cold-retard-overproof`, `no-rise-no-oven-spring`
  - **Shaping/scoring (2):** `loaf-spreads-flat-pancake`, `no-ear-blowout-scoring`
  - **Crust (3):** `crust-thick-tough`, `crust-pale-no-color`, `crust-burning-crumb-undercooked`
  - **Crumb (3):** `crumb-gummy`, `crumb-dense-tight`, `fools-crumb-large-irregular-holes`
- **Entry schema:** `{ id, type: "troubleshooting", problem, symptoms, causes[], fixes[], tags[] }` — fixes include concrete numbers (F/C temps, hydration %, feeding ratios, internal-temp targets 205-210°F).
- **Controlled tag vocabulary:** `starter, dough, fermentation, bulk, crumb, crust, bake, shaping, scoring, hydration, gluten, temperature, steam, smell, contamination, safety, storage, new-starter, cold-proof, overproofed, structure, technique, flour`. Lowercase, consistent — usable for filtering or faceting later.
- **Notable entries to design evals around:**
  - The two safety entries (`starter-pink-orange-serratia`, `starter-mold-fuzzy`) — agent should always recommend discard, never try to "save" the starter. Good faithfulness/safety eval target.
  - `new-starter-false-rise-leuconostoc` is a classic misleading symptom — easy hard-difficulty scenario.
  - `no-rise-no-oven-spring` vs. `crumb-dense-tight` overlap in causes but differ in symptoms — good retrieval-discrimination test.
#### 1b. Recipe Entries (`/data/sourdough-recipes.json`)
- **Coverage (~8–10 recipes):**
  - **Core loaves:** classic country loaf (75% hydration), whole wheat blend (80% hydration), high-hydration open-crumb (~85%)
  - **Enriched/flavored:** cinnamon-raisin, seeded loaf (sesame/poppy/sunflower)
  - **Discard recipes:** sourdough pancakes, sourdough crackers, sourdough banana bread
  - **Beginner loaf:** a simplified 4-step beginner recipe with less precision required (good for first-timers asking "how do I even start?")
- **Entry schema:** `{ id, type: "recipe", name, description, difficulty, yield, ingredients[], steps[], tips[], tags[] }` — steps include timing, temperatures, and visual cues (e.g., "dough should jiggle like Jello when done with bulk"). Tips cross-reference troubleshooting entries by ID where relevant (e.g., "if your loaf spreads flat, see `loaf-spreads-flat-pancake`").
- **Shared tag vocabulary** extended with: `recipe, discard, enriched, beginner, whole-wheat, high-hydration, pancakes, crackers, loaf`.

#### 1c. Shared Embedding + Retrieval
- **Precomputed embeddings:** `/data/sourdough-embeddings.json` — generated once via `scripts/embed-knowledge.ts`, covers both troubleshooting and recipe entries. Avoids cold-start re-embedding cost on serverless and makes retrieval deterministic across deploys.
- **Retrieval module:** `/lib/knowledge-base.ts` — loads both JSON files at module init, exposes `retrieveKnowledge(query, topK=3)` that embeds the query and returns top cosine matches with similarity scores and `type` field. Scores get logged into trace attributes for eval.

### 2. Agent API Route (`/app/api/chat/route.ts`)
- Vercel AI SDK `streamText` with:
  - **Model selection:** reads `x-model-id` request header (sent by the UI); falls back to a default (e.g., `anthropic/claude-sonnet-4-6`). Passed directly to `openrouter(modelId)`.
  - **System prompt:** Sourdough expert persona — detects whether the user wants help baking something (recipe mode) or diagnosing a failure (troubleshooting mode). In troubleshooting mode: gathers symptoms first, reasons step by step, cites specific causes, recommends one primary fix plus alternatives. In recipe mode: walks through the recipe step by step, answers questions about timing/technique, and surfaces relevant troubleshooting tips proactively.
  - **Tools:**
    - `lookupKnowledge(query)` — semantic search over all entries (both `type: "recipe"` and `type: "troubleshooting"`). Returns top-3 matches with scores and type. The agent uses the returned `type` to determine which response style to adopt.
    - `recordSymptom(symptom, severity)` — builds up structured state about the user's problem in troubleshooting mode (e.g., `{ symptom: "gummy crumb", severity: "moderate" }`). Produces clean, inspectable trace spans and gives evals a structured record of what the agent understood vs. what was actually wrong.
    - `recordRecipeStep(recipeId, stepNumber, userQuestion)` — analogous to `recordSymptom` but for recipe mode. Tracks which step the user is on and what they asked, producing trace data that eval can use to check whether the agent stayed on-recipe.
  - `experimental_telemetry: { isEnabled: true, functionId: "sourdough-chat" }` — enables Arize tracing.
- **Key routing:** checks `x-openrouter-key` header first (user-supplied key from UI); falls back to `process.env.OPENROUTER_API_KEY` (Vercel env var). Requests using the fallback key are rate-limited (10 messages/session); requests with a user key are unlimited.
- **Trace attributes logged per turn:** `model_id`, `session_id`, `key_source` (`"user"` or `"fallback"`), `recorded_symptoms`, `recipe_step`.
- Multi-turn conversation via `messages` array. Recorded symptoms (troubleshooting) and recipe progress (recipe mode) are passed back into context on each turn.

### 3. Chat UI (`/app/page.tsx`)
- Vercel AI SDK `useChat` hook
- Simple clean chat interface
- Tool call indicators when knowledge is being retrieved, a symptom is being recorded, or a recipe step is being tracked
- **Model selector dropdown** — list of curated OpenRouter model IDs (e.g., `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`, `google/gemini-flash-2.0`, `meta-llama/llama-3.3-70b-instruct`, `mistralai/mistral-small`). Selected model ID sent in `x-model-id` header on every request.
- **API key settings panel** — optional field to paste a personal OpenRouter key. Stored in `localStorage`, sent in `x-openrouter-key` header. Shows "Using your key" vs "Using shared key (X/10 messages used)" indicator.
- Sidebar that adapts to mode:
  - **Troubleshooting mode:** shows the running list of recorded symptoms
  - **Recipe mode:** shows the recipe name and a step progress tracker (step N of M), making the agent's context visible to the user and the demo more compelling

### 4. Arize Instrumentation (`/instrumentation.ts`)
- `registerOTel` from `@vercel/otel`
- `OpenInferenceSimpleSpanProcessor` from `@arizeai/openinference-vercel`
- Exports to Phoenix Cloud
- Captures: LLM calls, tool calls, token usage, latency, full message history, retrieval scores
- Custom span attributes: `session_id`, `model_id`, `key_source`, `recorded_symptoms`, `recipe_step` — `model_id` is the key attribute that enables model comparison grouping in Arize experiments

### 5. Eval Notebook (`/evals/sourdough_evals.ipynb`)
- Python notebook driving the Arize eval workflow
- Golden dataset (~20 scenarios, mixed difficulty) — see Dataset section below
- Evaluators (LLM-as-judge using Claude):
  - **Diagnostic accuracy** — did the agent reach the correct root cause? (troubleshooting mode)
  - **Recipe accuracy** — did the agent retrieve the right recipe and follow its steps correctly? (recipe mode)
  - **Mode detection** — did the agent correctly identify whether the user wanted troubleshooting or recipe help?
  - **Clarification quality** — did it gather enough symptoms (troubleshooting) or clarify recipe intent (recipe) before proceeding? (uses `recordSymptom` / `recordRecipeStep` trace data)
  - **Faithfulness/hallucination** — did it cite causes/fixes/steps not present in the retrieved entries? (uses retrieval span output as the grounding context)
  - **Conciseness** — did it avoid rambling?
- Upload dataset + run experiments via Arize Python SDK

---

## File Structure
```
sourdough-agent/
├── app/
│   ├── api/chat/route.ts        # Agent API route (OpenRouter + key routing + rate limit)
│   ├── page.tsx                 # Chat UI
│   └── layout.tsx
├── components/
│   ├── ModelSelector.tsx        # Dropdown of curated OpenRouter model IDs
│   ├── ApiKeyPanel.tsx          # Optional user key input + usage indicator
│   └── Sidebar.tsx              # Adaptive sidebar (symptoms or recipe step tracker)
├── data/
│   ├── sourdough-knowledge.json # Troubleshooting entries (~21)
│   ├── sourdough-recipes.json   # Recipe entries (~8-10)
│   └── sourdough-embeddings.json # Precomputed embeddings (both files)
├── lib/
│   └── knowledge-base.ts        # Load + retrieval logic
├── scripts/
│   └── embed-knowledge.ts       # Run once; writes embeddings JSON
├── evals/
│   ├── sourdough_evals.ipynb    # Python eval notebook
│   └── golden-dataset.json      # Test scenarios
├── instrumentation.ts           # Arize/OTEL setup
├── next.config.ts               # Enable instrumentationHook
├── .env.example                 # Committed — blank keys for collaborator setup
└── .env.local                   # Gitignored — real keys for local dev
```

---

## Environment Variables
```
OPENROUTER_API_KEY=       # fallback key (set in Vercel env vars, never committed)
OPENAI_API_KEY=           # for text-embedding-3-small only
PHOENIX_API_KEY=          # Arize Phoenix Cloud
PHOENIX_COLLECTOR_ENDPOINT=https://app.phoenix.arize.com/v1/traces
RATE_LIMIT_MAX=10         # max messages per session on fallback key
```

`.env.example` (committed, blank values) documents all required keys for collaborators. `.env.local` (gitignored) holds real values locally. Vercel project env vars hold production values.

---

## Golden Dataset (~28 scenarios)
Each scenario:
```json
{
  "id": "...",
  "mode": "troubleshooting | recipe",
  "difficulty": "easy | medium | hard",
  "user_messages": ["initial problem statement", "follow-up answer", ...],
  "expected_root_cause_id": "matches a knowledge base entry id (troubleshooting mode)",
  "expected_recipe_id": "matches a recipe entry id (recipe mode)",
  "expected_symptoms": ["list", "of", "symptoms", "agent", "should", "extract"],
  "expected_step_reached": "step number user should reach by end of conversation (recipe mode)",
  "notes": "what makes this hard / what we're testing"
}
```

### Troubleshooting scenarios (~20)
- **Easy (~7):** clear single-cause problems with all info in the first message
- **Medium (~8):** require 1-2 clarifying turns; ambiguous symptoms; possible to retrieve the wrong entry
- **Hard (~5):** misleading symptoms, multiple plausible causes, user provides irrelevant info, or the real cause is a *combination* of two entries
- **Mandatory hard scenarios:**
  - **Leuconostoc false rise** — new starter is "active" on day 2 but isn't really fermenting yet. Agent should recognize this as a known false-positive, not declare success.
  - **Pink/orange Serratia or fuzzy mold** — agent must recommend discard for food safety, never suggest scraping or feeding through. Faithfulness eval doubles as a safety eval here.
  - **No-rise vs. dense-crumb disambiguation** — symptoms partially overlap; tests whether the agent gathers enough info via `recordSymptom` to retrieve the right entry instead of the close-but-wrong one.

### Recipe scenarios (~8)
- **Easy (~3):** user asks for a specific recipe by name; agent retrieves the right one and walks through step 1
- **Medium (~3):** user asks a vague question ("something simple for beginners", "what can I do with discard?"); agent asks a clarifying question before committing to a recipe
- **Hard (~2):** user is mid-recipe and asks a question that requires the agent to stay on-recipe AND cross-reference a troubleshooting entry (e.g., "I'm on step 3 of the country loaf and my dough is tearing during shaping — is that normal?")

Spread of difficulty and modes ensures eval scores have variance — flat 100% or flat 0% tells you nothing.

---

## Arize Workflows Demonstrated

### 1. Tracing
Every chat turn produces a trace with: retrieval span (with similarity scores), LLM span, tool call spans for both `lookupKnowledge` and `recordSymptom`. Custom attributes for session ID and accumulated symptoms.

### 2. Evals
Upload golden dataset, run all four evaluators against agent traces, score per scenario.

### 3. Iteration loop (the heart of the demo)
**Iteration 1 — fix hallucination**
- Run baseline evals → identify that the agent invents fixes not in the retrieved entries (e.g., it adds "use a Dutch oven at 500°F" when the knowledge base says nothing about Dutch ovens).
- Update system prompt to constrain answers to retrieved content; require it to say "I don't have specific guidance on that" when off-corpus.
- Re-run evals → show faithfulness score improves from X → Y.

**Iteration 2 — fix clarification quality**
- After fixing hallucination, run evals again → notice the agent now refuses to diagnose when it has enough info, OR jumps to diagnosis without asking enough questions.
- Update prompt to add a "gather at least 2 symptoms before diagnosing" rule, with `recordSymptom` as the evidence channel.
- Re-run evals → show clarification score improves without regressing the faithfulness gain.

This produces a clear narrative slide: "here's the loop, here's how Arize made each failure visible, here's the measured improvement."

### 4. Prompt experiments
Compare the three system prompt variants (baseline, after iter 1, after iter 2) in Arize Prompt Playground side-by-side on the same golden dataset.

### 5. Dataset upload
Push the golden dataset to Arize as a versioned dataset so experiments are reproducible.

### 6. Model comparison (OpenRouter)

**Goal:** run the same golden dataset through multiple models and let Arize surface the cost/quality tradeoff as a data story — not opinion.

**Models:**
| Model | OpenRouter ID | Why included |
|---|---|---|
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` | Baseline / highest quality anchor |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Cheap Anthropic option |
| Gemini Flash 2.0 | `google/gemini-flash-2.0` | Best price/token on the market |
| Llama 3.3 70B | `meta-llama/llama-3.3-70b-instruct` | Strong open-weight, free tier via Groq |
| Mistral Small | `mistralai/mistral-small` | European alternative, solid instruction following |

**How it runs:**
1. Eval notebook loops over the model list, sending each golden scenario to the API route with the `x-model-id` header set
2. Each model gets its own Arize experiment name: `model-comparison-{model_id}-{date}`
3. All six evaluators run against every model's traces
4. `model_id`, `input_tokens`, `output_tokens`, and `latency_ms` are captured as span attributes on every trace — Arize aggregates these automatically

**What Arize shows:**
- Eval score table: each model × each evaluator → find where cheaper models regress
- Latency distribution per model: see which models are fast enough for interactive use
- Token usage per model: combined with OpenRouter pricing → estimated cost per golden-dataset run
- Filtering by `model_id` in Phoenix lets you drill into individual failing traces per model

**Metrics to report:**
- `diagnostic_accuracy` — most important; does the model get the right root cause?
- `faithfulness` — does cheaper model hallucinate more fixes not in the knowledge base?
- `conciseness` — do some models ramble where others are tight?
- `avg_latency_ms` + `avg_total_tokens` → cost-per-conversation estimate

**Expected narrative:** Claude Sonnet is the quality ceiling. Haiku and Gemini Flash trade some accuracy for 5–10x lower cost. Llama may surprise on structured troubleshooting tasks. The Arize experiment view makes this a chart, not a claim.

**Key implementation note:** the eval notebook drives all model runs server-side — collaborators don't need their own model keys for this workflow. Only your `OPENROUTER_API_KEY` is used.

---

## Build Order
1. Scaffold Next.js app, install dependencies (`ai`, `@ai-sdk/openrouter`, `@arizeai/openinference-vercel`, `@arizeai/phoenix-otel`)
2. ~~Research agent produces `sourdough-knowledge.json`~~ — **DONE** (21 entries written to `data/sourdough-knowledge.json`)
3. Author `sourdough-recipes.json` (~8–10 recipes: country loaf, whole wheat, high-hydration, discard pancakes, crackers, banana bread, beginner loaf, seeded loaf) **DONE**
4. Update `scripts/embed-knowledge.ts` to embed both JSON files into a unified `sourdough-embeddings.json`; generate it
5. Implement `lib/knowledge-base.ts` (load + cosine retrieval across both entry types)
6. Build agent API route — OpenRouter model selection from `x-model-id` header, key routing (`x-openrouter-key` → fallback env var), rate limiting on fallback key, `lookupKnowledge` + `recordSymptom` + `recordRecipeStep` tools, `model_id` + `key_source` trace attributes, telemetry
7. Build `ModelSelector` + `ApiKeyPanel` components; wire into chat UI with adaptive sidebar
8. Add `.env.example` and `.gitignore`; configure Vercel env vars
9. Wire up Arize instrumentation, verify traces appear in Phoenix with `model_id` attribute visible
10. Author golden dataset (~28 scenarios: ~20 troubleshooting + ~8 recipe)
11. Write eval notebook with all six evaluators
12. Run baseline evals on default model, capture scores
13. **Iteration 1:** identify hallucination failures, update prompt, re-run, capture improvement
14. **Iteration 2:** identify clarification/mode-detection failures, update prompt, re-run, capture improvement
15. **Model comparison:** run golden dataset against 4 models via OpenRouter, compare scores + cost/latency in Arize
16. Run prompt variants in Arize Playground for side-by-side comparison
17. Write up the iteration + model comparison narrative for presentation

---

## Verification
- Start dev server, chat with the agent about a sourdough problem
- Confirm traces appear in Phoenix with retrieval + LLM + tool spans, similarity scores, `model_id`, and `key_source` attributes visible
- Switch model in the UI dropdown, send a message, confirm `model_id` changes in the next trace
- Paste a personal OpenRouter key in the API key panel, confirm "Using your key" indicator appears and rate limit counter disappears
- Run eval notebook, confirm scores appear in Arize for the default model
- Confirm the iter-1 → iter-2 score deltas are visible in the experiments view
- Run model comparison loop in the notebook, confirm 5 separate experiments appear in Arize with scores and latency data
- Side-by-side prompt comparison renders cleanly in Playground

---

## PM Deliverable

This is the core output Arize is evaluating beyond the technical build. Three artifacts are required:

### Artifact 1: Onboarding Reflection Slide

A single slide (or equivalent written section) covering the actual experience of setting up Arize AX for the first time. Capture this in real time during the build — don't reconstruct it after.

**What to document as you go:**
- First moment of confusion (what was the mental model mismatch?)
- First moment of "oh, this is actually useful" (what unlocked it?)
- Time-to-first-trace: from zero to a trace visible in Phoenix
- Time-to-first-eval: from traces to a scored eval run
- Anything you had to Google, read docs for, or ask about
- Any error messages that were unhelpful or misleading
- Anything you expected to exist that didn't

**Slide structure:**
- Title: "Onboarding to Arize AX: What I Actually Experienced"
- Three columns: What Went Well / What Was Confusing / What I'd Fix
- One callout: the single highest-friction moment and what it cost (time, momentum, clarity)

---

### Artifact 2: Product Proposal

**The question:** What feature should Arize build to increase AX adoption for developers building agent applications?

**Framing:** Answer this from the pain you felt during the take-home, not from the outside. The strongest proposals come from "I hit this wall, here's what I wished existed."

#### Proposal structure (for the written doc + engineering pitch):

**1. The Problem**
- Who specifically hits this (persona: AI engineer, PM, data scientist, ML engineer)
- What they're trying to do and where they get stuck
- Why current tooling (Arize or otherwise) doesn't solve it
- Quantify if possible: how often does this happen, what does it cost (time, quality, confidence)

**2. The Insight**
- What's the non-obvious thing you learned by actually building an agent and running it through Arize?
- Why are developers building agents differently than traditional ML — and what does Arize's product not yet reflect about that shift?

**3. The Feature**
- Name it clearly
- One sentence on what it does
- Who uses it, when, and what they do differently because of it
- What success looks like (metric: adoption, time-saved, eval scores improved, etc.)

**4. The MVP**
- Exactly what ships in v1 — be ruthless about scope
- What's explicitly out of scope for v1 and why
- Technical approach at one level of abstraction above implementation (no pseudocode, but enough that an engineer can estimate)
- One architecture diagram or Excalidraw mock showing the UX flow or data flow

**5. The Pitch to Engineering**
- Why now (what's the tailwind — agent adoption curve, LLM cost pressure, eval tooling maturity)
- What we're not building (the adjacent idea you're intentionally deferring)
- How we'll know it worked (success metric, observable within 60 days of ship)
- Risks: what could make this harder than it looks

#### Candidate feature directions (pick one and go deep, or use your own):

**A. Agent Step Debugger**
Most Arize traces show a flat list of spans. For agents, what developers actually need is a branching execution tree — "the agent took this path because of this retrieval result, which came from this query." The insight: agent failures are usually *routing failures*, not generation failures. A visual step-by-step debugger that lets you replay an agent's decision tree, annotate where it went wrong, and attach that annotation to an eval label would collapse the gap between "I see a bad trace" and "I know what to fix."

**B. Eval-to-Prompt Copilot**
Running evals is table stakes. The hard part is knowing what to change in your prompt after evals reveal a failure. Current workflow: eval → read failing traces manually → guess what prompt change fixes it → re-run. Proposed: after an eval run, Arize surfaces a "what changed" diff view comparing the failing traces and suggests specific prompt edits, ranked by predicted impact on the failing evaluator. Closes the loop from measurement to action without leaving the platform.

**C. Live Agent Health Dashboard**
Development evals tell you if your agent is good. Production tells you if it stays good. The gap: there's no lightweight way to set up "alert me if faithfulness drops below 0.8 on production traces this week" without writing custom monitoring. Proposed: a no-code eval guardrail config where you pick an evaluator, set a threshold, and get notified (Slack/email) when production traces start failing it. Turns Arize from a dev-time tool into an always-on quality monitor.

**D. Retrieval Calibration View**
For RAG agents, retrieval quality and generation quality are entangled but distinct. Arize doesn't currently make it easy to isolate "did we retrieve the right chunk?" from "did the LLM use the chunk correctly?" Proposed: a retrieval-specific eval panel that scores whether the top-K retrieved results actually contained the answer, independent of what the LLM said. Gives developers a second axis to optimize — and makes it clear whether a bad answer is a retrieval problem or a generation problem.

---

### Artifact 3: The Mock or Diagram

One concrete visual artifact to accompany the proposal. Options:
- **Excalidraw:** UX flow showing the feature from the developer's perspective (what they click, what they see, what decision they make)
- **Figma:** Higher-fidelity mock of the specific UI change (e.g., what the Agent Step Debugger looks like in the Phoenix trace view)
- **Architecture diagram:** Data flow for how the feature would work technically (e.g., how eval guardrail thresholds get evaluated against incoming production traces)

This artifact should be included in the final writeup and referenced in the engineering pitch section.

---

### Capture Log (fill in during the build)

Use this section to log real friction in real time. These notes are the raw material for Artifact 1 and 2.

```
[ ] Time to first trace: ___
[ ] Time to first eval score: ___
[ ] Biggest unexpected blocker: ___
[ ] Error message that was unhelpful: ___
[ ] Feature I expected to exist but didn't: ___
[ ] Moment I felt most confident in the product: ___
[ ] Moment I felt most lost: ___
[ ] What I Googled that wasn't in the docs: ___
```

---

## Additional ideas worth considering (not yet committed)
- **Synthetic eval generation:** use Claude to generate a second wave of golden scenarios from the knowledge base itself, then human-review. Demonstrates the "scale evals with LLMs" Arize talking point.
- **Online eval guardrail:** add a faithfulness check that runs on every production trace (not just the eval set), surfacing live regressions in Phoenix. Closes the loop from offline-eval to online-monitoring.
- **Retrieval-only eval:** measure whether the right knowledge entry is in the top-3 *before* even looking at the agent's answer. Isolates retrieval quality from generation quality — a separate axis Arize visualizes well.
- **Latency/cost panel:** screenshot the Phoenix latency + token-usage views for the writeup; cheap to include and shows operational awareness.
