# LLM Application Engineering

The layer between your app and the model. Get this right and most "the model is bad" problems
disappear.

## Contents
- Prompting that survives contact with production
- Structured outputs (the part that actually breaks)
- Function / tool calling
- Streaming
- Context-window management & prompt caching
- The resilience layer (retries, fallbacks, validation)
- Multi-provider abstraction

---

## Prompting that survives contact with production

Prompt engineering is not "phrasing tricks." It is specifying a task precisely enough that a
stochastic system does it reliably. Principles that matter more than any single tactic:

- **Role + task + constraints + format, in that order.** Tell the model who it is, what to do,
  what not to do, and exactly what shape to return. Vague prompts fail non-deterministically,
  which is the worst kind of failure to debug.
- **Show, don't just tell (few-shot).** 2–5 examples that cover the *edge* cases (empty input,
  ambiguous input, the format you keep getting wrong) beat a paragraph of description. Examples
  are the highest-leverage tokens in most prompts.
- **Let it think before it answers (for reasoning tasks).** Ask for reasoning *then* the answer,
  or use a dedicated reasoning model. Forcing an immediate answer on a multi-step problem is the
  #1 avoidable accuracy loss. But separate the thinking from the payload so you can parse cleanly.
- **Put the stable stuff first, the variable stuff last.** Instructions and examples up top
  (cache-friendly), the user's specific input at the bottom. For long context, restate the key
  instruction *after* the injected documents — models attend more to the ends.
- **Negative space matters.** Say what to do when the model *can't* comply: "If the answer isn't
  in the context, say 'I don't know' — do not guess." Hallucination is often just an unspecified
  fallback.
- **Iterate against evals, not vibes.** Change one thing, re-run the eval set, keep what wins.
  A prompt "improvement" with no measurement is a coin flip. See `evaluation-and-llmops.md`.

### Prompt structure template
```
[System] You are <role>. Your job is <task>.
Rules:
- <hard constraint>
- If <edge case>, then <fallback behavior>.
Output format: <exact schema / example>.

[Few-shot] <example input> → <example output>   (×2–5, covering edges)

[User] <the actual input, clearly delimited e.g. <input>...</input>>
```

Delimit injected/user content with explicit tags (`<document>`, `<input>`). It improves parsing
*and* is a first line of defense against prompt injection (see `evaluation-and-llmops.md`).

---

## Structured outputs (the part that actually breaks)

Getting valid JSON/typed output every time is where naive integrations fall over. Layers of
defense, strongest first:

1. **Use native structured-output / JSON mode / tool-calling when the provider offers it.**
   Constrained decoding (the provider guarantees schema-valid output) is far more reliable than
   asking nicely. Verify the current API shape via Context7 — it differs by provider and changes.
2. **Define the schema once, share it.** A Pydantic/Zod model → JSON Schema fed to the API *and*
   used to validate the response. One source of truth. Never describe the schema in prose in the
   prompt and separately in code — they drift.
3. **Always parse-and-validate the response.** Even in JSON mode, wrap parsing in try/except and
   validate against the schema. Treat a schema-invalid response as a *retryable error*, not a crash.
4. **Repair loop, not blind retry.** On invalid output, send the model its own broken output plus
   the validation error and ask it to fix it. Cap at ~2 attempts, then fall back.
5. **Prefill / stop tokens** (where supported): start the assistant turn with `{` to force JSON;
   set a stop sequence to prevent trailing prose.

Anti-pattern: regex-scraping fields out of freeform prose. It works in the demo and breaks on the
first input you didn't test. If you're regexing model output, you skipped step 1.

---

## Function / tool calling

Tool calling is how the model *acts*. The model doesn't run your function — it emits a request to
call it; you run it and feed the result back.

- **Tool descriptions are prompts.** The name, description, and parameter descriptions are the
  only thing the model sees. Write them like you're explaining to a new engineer: what it does,
  when to use it, what each arg means, what it returns. Bad descriptions → wrong tool, wrong args.
- **Keep the toolset small and orthogonal.** 5 clear tools beat 20 overlapping ones. Overlap makes
  the model pick wrong.
- **Validate arguments before executing.** The model *will* eventually emit a malformed or unsafe
  argument. Validate against the schema and guard side effects.
- **Return structured, informative results** — including errors. "Error: file not found, available
  files: [...]" lets the model recover; a bare stack trace doesn't.
- The full call→execute→observe loop (multiple rounds, parallel calls) belongs to agents — see
  `agents.md`. A single tool call to get structured data is just app engineering.

---

## Streaming

Stream tokens for any user-facing generation over ~1s — perceived latency is what users feel.

- Stream to the UI as tokens arrive; **buffer for parsing.** You can show text live but you can't
  act on structured output until it's complete and validated.
- Handle mid-stream failures: a stream can die halfway. Detect truncation (no stop reason) and
  retry or degrade.
- Streaming + tool calls + structured output interact awkwardly per provider. Check current
  behavior via Context7 rather than assuming.

---

## Context-window management & prompt caching

- **The window is a budget, not a bucket.** Bigger windows don't mean "dump everything in."
  Irrelevant context *lowers* accuracy (distraction) and *raises* cost/latency. Curate.
- **Lost in the middle:** models recall the start and end of long context better than the middle.
  Put the most important material at the edges; for RAG, rank best chunks toward the top/bottom.
- **Prompt caching:** most providers cache a stable prefix so repeated calls with the same
  system prompt + examples + documents are much cheaper and faster. Structure prompts as
  [stable prefix → cache breakpoint → variable suffix]. This is often the single biggest cost win.
- **Summarize/compact long histories** rather than sending the full transcript every turn (see
  agent memory in `agents.md`).

---

## The resilience layer

Non-determinism is the environment. Every production LLM call needs:

- **Timeouts** — models occasionally hang; never make an unbounded call.
- **Retries with backoff** — on 429/5xx/timeout. Respect `Retry-After`. Jitter to avoid thundering herds.
- **Fallbacks** — a cheaper/faster model, a different provider, or a degraded non-AI path when the
  primary is down or rate-limited. Design what "AI unavailable" looks like *before* it happens.
- **Output validation** — every response is untrusted until parsed and schema-checked (above).
- **Idempotency for side effects** — a retried call must not double-charge or double-send.
- **Cost/latency guardrails** — cap max tokens; kill runaway loops; log token usage per call.

---

## Multi-provider abstraction

Keep the model swappable so you can change vendors, drop to a local model for privacy, or route
cheap vs. expensive by task — without rewriting the app.

- A thin `LLMClient` interface: `complete(messages, tools?, schema?) -> ValidatedResult`.
  Providers implement it; the app depends only on the interface.
- Normalize the differences you actually hit: message roles, system-prompt handling, tool-call
  format, token accounting, streaming events. Don't try to abstract *everything* — abstract what
  varies for your use.
- **Model routing:** cheap/fast model for easy calls, strong model for hard ones, escalate on low
  confidence. Route on task, not globally.
- OpenAI-compatible endpoints (vLLM, many gateways, Ollama's compat mode) let one client class
  cover local + cloud. `scripts/scaffold_ai_app.py` sets this up.

Frameworks (LiteLLM, LangChain, etc.) can provide this; a ~100-line adapter you control is often
clearer for a focused app and won't surprise you when the framework changes. Choose deliberately.
