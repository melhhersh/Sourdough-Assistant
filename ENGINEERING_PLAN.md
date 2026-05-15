# Sourdough Assistant — Engineering Plan

Execution-ordered plan derived from `PLAN.md`. The architecture, knowledge base design, and PM deliverables in `PLAN.md` remain the source of truth for *what* we are building and *why*. This document covers *in what order* we build it, and *which git commits* mark each verifiable checkpoint.

## Guiding principles

1. **Validate the architecture end-to-end before adding features.** The riskiest unknowns are the Vercel AI SDK + OpenRouter + Arize/Phoenix instrumentation pipeline working together. We prove that with a trivial agent first, then layer features onto a known-good spine.
2. **Every phase ends with a working app and a green git commit.** No half-merged states. If a phase can't end in a working app, it's too big and gets split.
3. **One concern per commit.** Scaffolding, deps, instrumentation, retrieval, tools, UI, evals — each lands in its own commit so we can bisect and revert cleanly.
4. **Defer anything that doesn't unblock the next phase.** Recipe mode, rate limiting, model selector, and the API key panel are all post-spine work. The spine is: chat → retrieves → answers → traces appear in Phoenix.
5. **Log onboarding friction while building.** Artifact 1 (PLAN.md §PM Deliverable) requires real-time capture. Append to `PLAN.md`'s Capture Log every time something surprises us.

---

## Phase 0 — Repo hygiene (1 commit)

Goal: clean baseline before the first feature commit.

- Initialize a real `.gitignore` (`.env.local`, `node_modules`, `.next`, `.vercel`, Python `__pycache__`, `.ipynb_checkpoints`).
- Add `.env.example` with all keys from PLAN.md §Environment Variables, blank values.
- First commit: `chore: initial repo scaffolding and gitignore`.

The existing `data/sourdough-knowledge.json` and `data/sourdough-recipes.json` get committed here too (they're authored content, not generated).

**Checkpoint:** `git log` shows one commit. `git status` is clean.

---

## Phase 1 — Architecture spine (3–4 commits)

Goal: prove the *entire pipeline works* with the smallest possible agent. No retrieval, no tools, no recipe mode, no UI polish. Just: user types a message → OpenRouter responds → trace lands in Phoenix.

This is the highest-risk phase because every integration touches a third-party system we haven't wired up before. We want to hit those errors with nothing else in the codebase to blame.

### 1.1 Next.js + AI SDK scaffold
- `npx create-next-app@latest` (App Router, TypeScript, Tailwind).
- Install `ai`, `@ai-sdk/openrouter`.
- `/app/api/chat/route.ts` with `streamText`, hardcoded model `anthropic/claude-sonnet-4-6`, no tools, no system prompt beyond "you are helpful".
- `/app/page.tsx` with bare `useChat` — text input, message list, no styling beyond defaults.
- Commit: `feat: minimal chat scaffold with OpenRouter via AI SDK`.
- **Verify:** dev server runs, send a message, get a streamed response in the browser.

### 1.2 Arize/Phoenix instrumentation
- Install `@arizeai/openinference-vercel`, `@arizeai/phoenix-otel`, `@vercel/otel`.
- `instrumentation.ts` per PLAN.md §4.
- Enable `experimental_telemetry` on `streamText` with `functionId: "sourdough-chat"`.
- Commit: `feat: wire Arize OpenInference tracing to Phoenix Cloud`.
- **Verify:** send a chat message, confirm a trace with an LLM span appears in Phoenix.
- **Log:** record time-to-first-trace in `PLAN.md` Capture Log.

### 1.3 Sourdough system prompt (still no retrieval)
- Replace the placeholder system prompt with the troubleshooting persona from PLAN.md §2 — but *without* the "constrain to retrieved content" rule yet (we want hallucination in the baseline so the iteration-1 eval improvement is real and measurable, not pre-empted).
- Commit: `feat: sourdough expert system prompt`.
- **Verify:** ask "my crumb is gummy, what do I do?" — agent answers in persona. Trace still lands.

At this point we have a *bad but observable* sourdough chatbot. The whole observability spine is proven. Everything from here is feature work on a known-good foundation.

---

## Phase 2 — Retrieval (3 commits)

Goal: ground the agent in the knowledge base. This is the single biggest quality lever and the prerequisite for faithfulness evals.

### 2.1 Embedding generation
- `scripts/embed-knowledge.ts` — reads both JSON files, emits `data/sourdough-embeddings.json` via `embed()` with `text-embedding-3-small`.
- Run it once, commit the output JSON. Embeddings are deterministic-enough and cheap-enough to check in; avoids cold-start regeneration.
- Commit: `feat: precompute knowledge base embeddings`.

### 2.2 Retrieval module
- `lib/knowledge-base.ts` — loads embeddings JSON at module init, exposes `retrieveKnowledge(query, topK=3)` with cosine similarity. Returns entries with `score` and `type`.
- No agent wiring yet. Add a `scripts/test-retrieve.ts` smoke test that runs a few queries and prints results.
- Commit: `feat: in-memory cosine retrieval over knowledge base`.
- **Verify:** smoke test returns sensible top-3 for known queries ("gummy crumb", "starter not rising").

### 2.3 `lookupKnowledge` tool wired into agent
- Add tool to `streamText` `tools` config.
- Update system prompt: tell the agent to call `lookupKnowledge` before answering.
- Commit: `feat: lookupKnowledge tool with retrieval-grounded answers`.
- **Verify:** trace in Phoenix shows the tool span with the retrieved entries and similarity scores in the span output. Agent answers cite specific causes/fixes from the corpus.

Spine + retrieval. This is enough to demo the agent and run a first eval pass. Everything after this is sharpening, not enabling.

---

## Phase 3 — Structured trace data (2 commits)

Goal: produce the structured trace attributes the evaluators need (PLAN.md §5 — clarification quality, mode detection).

### 3.1 `recordSymptom` tool + custom span attributes
- Add `recordSymptom(symptom, severity)` per PLAN.md §2.
- Add custom span attributes: `session_id`, `model_id`, `recorded_symptoms`. `model_id` is hardcoded for now (set by env or the default constant) — the selector comes in Phase 5.
- Pass accumulated symptoms back into context on each turn.
- Commit: `feat: recordSymptom tool and custom trace attributes`.
- **Verify:** multi-turn troubleshooting conversation shows symptom spans accumulating in Phoenix.

### 3.2 Sidebar showing symptoms (minimal UI)
- Sidebar that displays the running list of recorded symptoms client-side.
- This is the *minimal* UI feedback loop — no styling polish, just enough to see the agent's understanding while testing. Adaptive recipe-mode sidebar comes with recipe mode in Phase 4.
- Commit: `feat: symptom sidebar for troubleshooting mode`.

---

## Phase 4 — Recipe mode (3 commits)

Goal: second agent mode. Lower risk than Phase 2 because the retrieval pipeline already handles `type: "recipe"` entries — we're mostly adding routing logic and a second tool.

### 4.1 Recipe-aware system prompt + routing
- System prompt detects troubleshooting vs. recipe intent and adopts the right response style.
- `lookupKnowledge` already returns the `type` field; agent uses it to route.
- Commit: `feat: dual-mode system prompt for troubleshooting and recipe guidance`.
- **Verify:** "how do I make a country loaf?" walks through the recipe; "my crumb is gummy" stays in troubleshooting mode.

### 4.2 `recordRecipeStep` tool + recipe trace attributes
- Add tool per PLAN.md §2.
- Add `recipe_step` span attribute.
- Commit: `feat: recordRecipeStep tool and recipe step trace attribute`.

### 4.3 Adaptive sidebar (recipe progress + symptoms)
- Sidebar shows recipe name + step N of M in recipe mode, symptom list in troubleshooting mode.
- Commit: `feat: adaptive sidebar that follows agent mode`.

---

## Phase 5 — Multi-model + key management (2 commits)

Goal: enable the PLAN.md §6 model comparison story. Deferred to here because none of the prior phases need it — and putting it earlier would have meant building the selector before we knew traces worked.

### 5.1 Model selection via `x-model-id` header
- API route reads `x-model-id`, falls back to default.
- `ModelSelector` component with the curated OpenRouter list.
- `model_id` span attribute now actually varies.
- Commit: `feat: runtime model selection via OpenRouter`.
- **Verify:** switch model in dropdown, send message, confirm `model_id` attribute changes in Phoenix.

### 5.2 User API key + rate limiting on fallback
- `ApiKeyPanel` component, `localStorage` storage, `x-openrouter-key` header.
- API route: prefer user key, rate-limit fallback key per PLAN.md §2.
- `key_source` span attribute.
- Commit: `feat: user-supplied OpenRouter key with rate-limited fallback`.

---

## Phase 6 — Evals (3 commits)

Goal: the iteration-loop demo, which is the actual point of the take-home.

### 6.1 Golden dataset
- `evals/golden-dataset.json` per PLAN.md §Golden Dataset — all ~28 scenarios.
- Commit: `feat: golden eval dataset (28 scenarios across modes and difficulties)`.

### 6.2 Eval notebook + baseline run
- `evals/sourdough_evals.ipynb` per PLAN.md §5. All six evaluators.
- Run baseline against default model, capture scores.
- Commit: `feat: eval notebook with six evaluators and baseline scores`.
- **Log:** time-to-first-eval-score → Capture Log.

### 6.3 Iteration 1 + 2 prompt updates
- Iter 1: tighten system prompt to constrain to retrieved content. Re-run evals. Commit: `feat(prompt): iter 1 — constrain answers to retrieved content (faithfulness ↑)`.
- Iter 2: add "gather ≥2 symptoms before diagnosing" rule. Re-run. Commit: `feat(prompt): iter 2 — require symptom gathering before diagnosis (clarification ↑)`.

Each commit message captures the eval delta so the narrative is in the git history, not just slides.

---

## Verifiable checkpoints

These map to PLAN.md §Verification but are tied to specific commits, so we can show progress at any moment:

| After phase | What works | What's in Phoenix |
|---|---|---|
| 1 | Chat with sourdough persona | LLM spans, no retrieval |
| 2 | Grounded answers from corpus | LLM + retrieval spans, similarity scores |
| 3 | Multi-turn with symptom tracking | + tool spans, custom attributes |
| 4 | Both modes work end-to-end | + recipe_step attribute |
| 5 | Model + key switching | model_id varies, key_source attribute |
| 6 | Baseline + iter-1 + iter-2 scores | 3 experiments, deltas visible |
| 7 | Cross-model comparison | 5 experiments, cost/latency aggregations |

---

## Risk register

- **Phoenix Cloud auth/endpoint mismatch.** Most likely Phase 1.2 blocker. Mitigation: get a single hand-crafted span to land via `curl` or the Phoenix SDK directly before debugging the AI SDK integration on top of it.
- **OpenRouter model availability/quotas.** Some listed models (Llama 3.3 70B free tier, Gemini Flash 2.0) drift in availability. Mitigation: confirm each ID at Phase 5.1 with a one-line `curl`, swap any that 404 before building the dropdown.
- **`text-embedding-3-small` cost on full corpus regen.** Negligible (~$0.01 for 30 entries) but worth knowing before running the script repeatedly during iteration.
- **Trace attribute size limits.** `recorded_symptoms` could grow large in long conversations. Mitigation: cap at last 10 symptoms in the attribute payload; full state lives in the message history.
- **Eval determinism.** LLM-as-judge evaluators have variance. Mitigation: run each evaluator at temperature 0, average over 2–3 runs if a delta looks borderline. Note this in the writeup — it's also good Artifact 2 material.

---

## What is *not* in this plan

- Auth, user accounts, persistence beyond `localStorage` for the API key.
- Production deployment beyond a single Vercel preview.
- Synthetic eval generation, online guardrails, retrieval-only eval — these are PLAN.md §"Additional ideas" and stay there unless time permits after Phase 7.
