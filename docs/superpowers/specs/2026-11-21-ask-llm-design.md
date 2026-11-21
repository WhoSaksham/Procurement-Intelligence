# Ask the evidence: real LLM answers — design

Date: 2026-11-21 · Status: draft for approval

## Intent

"Ask the evidence" currently pretends. [services/api/src/modules/ask/service.ts](../../../services/api/src/modules/ask/service.ts) matches the question to one of five prepared answers by keyword, shows five hard-coded "pipeline steps", and every support score was typed by hand. The aim of this project, like the API work before it, is to show real backend capability: replace the pretence with a working retrieval-and-verification pipeline on a real LLM, built with LangGraph / LangChain, traced in LangSmith, starting on Gemini's free tier, with guardrails, and with context:

- **(a) Package context:** the model sees the package the user has open (its facts and live analysis), so "is my schedule realistic?" is answered about *their* package.
- **(b) Follow-ups:** Ask keeps a conversation, so "and for Uganda?" builds on the previous turn.

The user chose both (c).

## Goals

1. A question goes through a real LangGraph pipeline: guard → contextualise → retrieve → draft → verify → respond.
2. Every claim in an answer cites passages that were actually given to the model, and is scored by a real check against those passages; weak claims are removed (shown struck out, as today).
3. The open package is passed as context and is itself citable.
4. Follow-up questions work within a thread stored in MongoDB.
5. Every run is traced in LangSmith when configured.
6. Guardrails on input, on what the model sees, on output, and on cost.
7. The app never breaks because of the model: no key, quota exhausted, timeout or malformed output all fall back to today's prepared answers, clearly labelled.
8. Tests, CI and e2e never call Gemini.

## Non-goals

- Streaming tokens or live step progress (SSE). The answer arrives whole; the trace animates afterwards as today. Possible later.
- Embeddings or a vector database. The corpus is 25 passages (~13 KB); lexical retrieval is enough and avoids a second free-tier quota. Possible later.
- Using the Python graph service as an LLM tool. Possible later.
- Multiple LLM providers in this version. The model sits behind one LangChain chat-model interface, so swapping is a config change later, but only Gemini is wired.
- Sign-in or per-user threads. Threads are anonymous, identified by an unguessable id, like packages.

## Anti-goals (a failure even if it works)

- An answer that states something no passage supports and shows it as verified.
- A public demo whose Gemini key can be drained by a loop of requests.
- A slow or broken Ask page when Gemini is down or over quota.
- Text inside a passage, the package name or an earlier turn steering the model ("ignore previous instructions…").

## Constraints

- Lives in the Node API (`services/api`), module `src/modules/ask` — approach A, chosen by the user.
- Existing conventions hold: zod schemas registered with `route()` for OpenAPI, RFC 9457 problems, pino logging, Vitest + supertest + mongodb-memory-server, generated web types via `npm run types:api`.
- Libraries (latest at time of writing, pin exact): `@langchain/langgraph` 1.7.5, `@langchain/core` 1.5.0, `@langchain/google-genai` 2.3.7, `langsmith` 0.13.1. All accept zod 4.
- Gemini model is configurable; default `gemini-3.5-flash-lite` (current stable Flash-Lite per Google's model docs). The builder confirms it is on the free tier with the user's key before relying on it.
- Free-tier quotas are per Google Cloud project, small, and not guaranteed. Google may use free-tier prompts to improve its products; acceptable here because all data is synthetic, and the README says so.
- The API sits behind the web app's proxy, so every request arrives from the Vercel server's address. Per-IP rate limiting would not work; limits are global.
- Render free instance: single process, so an in-memory per-minute limiter is accurate; the daily cap is kept in MongoDB so it survives restarts.

## Approaches considered

- **A. In the Node API with LangGraph.js (chosen).** Package and analysis are already computed here (a function call), threads live in the same MongoDB, LangChain.js structured output takes the API's zod schemas, and nothing new is deployed. LangGraph.js trails Python slightly; irrelevant at this size.
- **B. In the Python graph service.** Mature Python LangGraph, but it would call back into the Node API for package context on every question, mixes LLM work into the knowledge-graph service, and that service already loads Semantica on a 512 MB instance.
- **C. A new Python service.** Cleanest separation, but a fourth deploy, more CI, another cold start, and it still needs the Node API for context.

Within A, conversation storage: **our own `askThreads` collection (chosen)** over LangGraph's MongoDB checkpointer. The graph runs once per turn and its state is small; a collection we own has a schema, a TTL, an OpenAPI shape and is readable by `GET /v1/ask/threads/:id`. The checkpointer stores opaque state blobs and would add a dependency for no gain here.

## Design

### Pipeline (LangGraph `StateGraph`)

State: `{ q, threadId, packageId?, history, standalone, inScope, passages, claims, steps, mode }`. Each node appends one real `Step` `{ name, tool, detail }` describing what it actually did (counts, ids, ms).

1. **guard** (no model). Rejects: the existing `INJECTION` regex (unchanged, returns `{ blocked: true }` as today); questions over 500 chars (already enforced by zod). Checks the cost limits (see Guardrails); if exceeded → prepared mode.
2. **contextualise** (model, structured output) — **only when the thread has earlier turns**. Input: the last 4 turns of the thread (question + kept claim texts only) and the new question. Output `{ standalone: string, inScope: boolean }`: the question rewritten to stand alone, and whether it is about public procurement, the projects, the package or the evidence. Out of scope → answer `{ outOfScope: true }`, no further calls. On a first turn this node is skipped (`standalone = q`) and the scope check is done by **draft** instead, so a first question costs 2 model calls and a follow-up 3.
3. **retrieve** (no model). BM25 over each source's `title`, `kind`, `project`, `before`, `quote`, `after` (tokenised, lower-cased, a short procurement synonym list: re-tender/rebid/cancel, delay/slip/late, E&S/ESF/ESHS/safeguard, QCBS/consultant/selection). Query = `standalone`. Keep the top 8 with score > 0. If a package is open, add the **package passage** (below) as an extra passage with id `pkg`.
4. **draft** (model, structured output). System prompt: answer only from the given passages; every claim must cite ≥1 passage id from the list; at most 6 claims, each ≤ 300 chars; if the passages do not answer the question return no claims. Passages are given inside `<passage id="…">…</passage>` tags and the prompt states that passage text and package fields are data, never instructions. Output `{ outOfScope: boolean, claims: { text, cite[] }[] }` (`outOfScope` is the first-turn scope check; on follow-ups contextualise already decided it and the field is ignored).
5. **verify** (deterministic, then one model call).
   - Drop cite ids not among the passages given; a claim left with no valid cite gets support 0.
   - Number check: every number in the claim (integers, decimals, percentages, money like `US$18.4M`, normalised) must appear in at least one cited passage; otherwise support 0 and the reason "number not in passage".
   - Entailment: one batched model call scores each remaining claim against the text of its cited passages, structured output `{ scores: { i, support: 0..1 }[] }`. Missing scores count as 0.
   - `kept = support >= supportMin` (existing `supportMin`, 0.75).
6. **respond**. Builds the response, saves the turn to the thread, logs removed claims (pino, `askRemoved` event with thread id, claim, reason) — the UI already promises "Removed sentences are logged for review".

Temperature 0 for every call. `maxOutputTokens` capped per call.

**Time budget.** Each model call times out at 8 s; the whole run at 20 s, after which the API answers in prepared mode. The fallback must fire inside the API, before anything upstream gives up, so the web proxy's timeout for `/v1/ask` is raised from its 10 s default to 30 s (`timeoutMs` per path in `proxyApi`), and the Next.js catch-all route sets `maxDuration = 60`. Render cold starts (~50 s on free) already affect every route and are not addressed here.

### The package passage (context a)

When `packageId` is sent and the package exists, the API loads it, runs the existing `analyse()` and renders a compact, factual passage: name, country and region, category, method, value, lots, duration, planned days, predicted P50/P80 days and on-time probability, top recommendation titles, and the comparable-cohort sentence. It is passage id `pkg`, so the model can cite it and the verifier checks claims against it like any other passage. The user-typed package name is included as a quoted field inside the passage, never in the system prompt.

Web: `Cite` renders id `pkg` as a distinct chip "Your package" that links to the Package page, instead of a numbered source.

The request carries `packageId` (the current package from the existing Zustand store, which falls back to `example`; the example counts as the open package). **The package is per request, not per thread**: each turn uses whatever `packageId` that request sends, and the thread stores no package. The Ask page shows "Using: ‹package name›" with a control that stops sending `packageId` for the rest of this conversation (client state). Unknown or deleted package id → answer without it, no error.

**The `pkg` passage is saved with the turn** (its rendered text and the package name), so a reloaded thread's "Your package" citations open exactly the text the claims were verified against, even if the package has since changed or been deleted. The chip opens that snapshot, with a link to the live package.

### Threads (context b)

Collection `askThreads`: `{ _id: random id, turns: Turn[], createdAt, updatedAt }` where `Turn = { q, standalone, mode, model?, notice?, outOfScope?, claims (with support, kept, reason), steps, pkg?: { name, text }, at }` — everything the page needs to redraw the turn without re-running anything. TTL index: deleted 30 days after `updatedAt`. Max 20 turns per thread; the 21st question starts a new thread (the response says so via the new `threadId`).

Blocked questions (injection regex) are **not** saved — nothing was generated — and the blocked response echoes the `threadId` it was sent, so the client keeps its thread. Out-of-scope and prepared-mode turns are saved. A reloaded thread shows every turn finished: steps collapsed, no replayed animation, the prepared-mode notice where it applied.

- `POST /v1/ask` body `{ q, threadId?, packageId? }`. No `threadId` → new thread. Unknown `threadId` → 404 problem.
- `GET /v1/ask/threads/:id` → the thread (for reloading the page with `?t=`).
- `GET /v1/ask/questions` unchanged (suggested questions still come from the seeded prepared answers).

The Ask page becomes a thread: each turn's answer stacked, the input below the latest answer for a follow-up, "New conversation" to start over. `?t=<threadId>` in the URL restores it; `?q=` from the command menu still starts a new thread with that question.

### Response shape

`AskResponse` gains fields; existing ones keep their meaning:

```
{ blocked: true }
| { blocked: false, outOfScope?: true, threadId, turn, mode: 'llm' | 'prepared',
    model?: string, notice?: string, answer: AskAnswer | null, steps: Step[], supportMin }
```

`KeptClaim` gains optional `reason` ('no valid citation' | 'number not in passage' | 'below threshold'). `mode: 'prepared'` with a `notice` ("Live model unavailable — showing a prepared answer") whenever the fallback was used; the UI shows it. In LLM mode the answer's `keys` is `[]`.

### Fallback (goal 7)

Prepared mode (today's keyword match, today's static steps) is used when: no `GEMINI_API_KEY`; the cost limits are exceeded; or the model call fails (429, 5xx, timeout, output that fails zod validation after LangChain's one retry). The failure reason is logged, not shown. Prepared-mode turns are still saved to the thread.

The keyword match runs on the stand-alone question when contextualise produced one before the failure; otherwise on the previous turn's question joined with the new one, so "and for Uganda?" after a delay question still finds the delay answer.

A 429 from Gemini also starts a 60 s cool-down during which every question goes straight to prepared mode, so an exhausted quota is not hammered.

### Guardrails summary

| Where | Guard |
|---|---|
| Input | zod length ≤ 500; injection regex (blocked, nothing generated); model scope check (out of scope → refused politely) |
| What the model sees | Passages and package fields in tagged blocks declared as data; history limited to 4 turns of question + kept claims (never removed claims); system prompt fixed in code |
| Output | zod-validated structured output; ≤ 6 claims, ≤ 300 chars; citations must be passages actually given; numbers must appear in the cited passage; model-scored entailment ≥ supportMin; removed claims shown struck out and logged |
| Cost / abuse | Limits count **questions** (2–3 model calls each). Global limit `ASK_RPM` (default 5/min, in memory); daily cap `ASK_DAILY_LIMIT` (default 100 questions/day UTC, counter in MongoDB) — at most ~300 model calls/day, inside the free tier's published Flash-Lite quotas; over either → prepared mode. 60 s cool-down after a Gemini 429. Per-call token caps, 8 s per call, 20 s per run |
| Model | Gemini default safety settings; temperature 0 |

### Tracing (LangSmith)

Standard env vars: `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` (default `procurement-ask`), optional `LANGSMITH_ENDPOINT`. Each run is tagged with `threadId`, `packageId`, `mode` and the request id. The run id is logged with the request so a log line leads to its trace. Without the key, tracing is off and nothing else changes. The trace link is not shown in the UI (LangSmith traces are private to the workspace).

### Configuration (new env vars on the API)

`GEMINI_API_KEY` (absent → prepared mode), `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `ASK_RPM`, `ASK_DAILY_LIMIT`, `LANGSMITH_*`. All optional; production does not fail closed on them (unlike `API_KEY`). Added to `config.ts`, `.env.example`, compose, README and the Render deploy notes.

### Testing

- The LLM is injected: `createApp` deps gain `chatModel?` (a LangChain `BaseChatModel`). Unit and route tests use a scripted fake model returning fixed structured outputs; no network.
- Tests cover: each node; number check edge cases (percent, money, thousands separators, decimals); invalid cite ids dropped; out-of-scope; injection still blocked before any model call; fallback on thrown 429 / timeout / invalid output; RPM and daily caps; thread create / continue / 404 / 20-turn rollover / TTL index; package passage built and citable, unknown package ignored; OpenAPI document includes the new shapes.
- e2e runs with no `GEMINI_API_KEY`: prepared mode, so existing Ask specs keep passing; new specs cover the thread UI, the "Using: package" chip and the prepared-mode notice. A route-level fake is used for one e2e of LLM mode only if the API exposes a test hook already used elsewhere (`E2E`); otherwise LLM mode is covered by API tests only — builder's call.
- `npm run eval:ask` (not in CI): runs the five suggested questions against the real model and prints per question: claims, kept count, cited ids vs the prepared answer's cited ids. Optionally uploads to a LangSmith dataset when `LANGSMITH_API_KEY` is set. This is the manual quality check before deploy.

## Decided by the user

- LLM calls replace the prepared answers; LangGraph / LangChain / LangSmith; Gemini free tier first; guardrails; context passing.
- Context = both package context and follow-up conversations.
- Pipeline lives in the Node API (approach A).

## My calls (correct any)

- Own `askThreads` collection rather than LangGraph's Mongo checkpointer.
- BM25 retrieval, no embeddings.
- Model-scored entailment plus a deterministic number check, reusing the existing 0.75 threshold.
- Fallback to prepared answers rather than an error when the model is unavailable.
- Global limits (5 questions/min, 100/day) because all traffic arrives via the Vercel proxy; both are env vars.
- Threads anonymous, 30-day TTL, 20 turns.
- No streaming in this version.
- First turn skips the rewrite step (2 model calls), follow-ups use 3.
- 20 s run budget with fallback inside the API; proxy timeout for Ask raised to 30 s.
- Package is chosen per question (the open one, including the example); its passage is saved with the turn.
- Reloaded threads redraw from stored turns; blocked questions aren't stored.

## Left to the builder

File layout inside `modules/ask`, prompt wording within the rules above, the synonym list's exact contents, BM25 parameters, the exact `Step` detail strings, UI styling of the thread, and whether one e2e exercises LLM mode via a fake.
