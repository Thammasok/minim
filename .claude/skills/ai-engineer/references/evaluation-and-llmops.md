# Evaluation & LLMOps

The part that separates a demo from a product. An LLM feature you can't measure, you can't
improve, and can't safely change. Build the eval before you build the feature.

## Contents
- Why eval is non-negotiable
- Building an eval set
- How to score (deterministic, LLM-as-judge, human)
- Offline vs online eval
- Regression testing & CI
- Observability / tracing
- Cost & latency optimization
- Caching
- Guardrails & safety (injection, PII, jailbreaks)
- Prompt & version management

---

## Why eval is non-negotiable

LLM output is non-deterministic and failure is silent — a wrong answer looks exactly like a right
one. "It worked when I tried it" tests 3 of the infinitely many inputs. Without evals you can't
tell if a prompt tweak, model swap, or new chunking strategy helped or quietly regressed. Eval is
the feedback loop the entire skill runs on; every other reference points back here.

---

## Building an eval set

- **Start small and real (~20–50 cases).** Representative inputs + expected output or grading
  criteria. Draw from real/anticipated usage, not invented easy cases.
- **Cover the edges:** empty input, ambiguous input, adversarial input, the long tail, and the
  failure you're currently trying to fix. Edge cases are where regressions hide.
- **Grow it from production.** Every real failure becomes a new eval case so it can't silently
  come back. The eval set is a living asset.
- **Label the *why*,** not just pass/fail, so results are diagnosable.
- For RAG, keep separate retrieval and generation cases (`rag.md`). For agents, evaluate whole
  *traces* (did it reach the goal, in how many steps, at what cost), not just the final string.

---

## How to score

Match the method to the task; most systems use a mix.

- **Deterministic / code-based** — exact match, JSON-schema validity, regex, contains-X,
  numeric tolerance, latency/cost thresholds. Cheap, fast, objective. Use wherever the output is
  checkable (extraction, classification, format). Prefer these; they're free to run in CI.
- **LLM-as-judge** — a strong model scores output against a rubric (faithfulness, relevance,
  tone, correctness). For open-ended output where code can't judge. Make it reliable:
  - give a **specific rubric and a scale**, not "rate 1–10" with no anchors,
  - prefer **pairwise comparison** (A vs B) over absolute scores — more stable,
  - **calibrate the judge against human labels** on a sample; a miscalibrated judge is worse than
    none because it looks rigorous,
  - watch judge biases (position, verbosity, self-preference) and control for them.
- **Human eval** — the ground truth for subjective quality and for calibrating the judge. Costly;
  spend it on the hard/ambiguous slice and on validating your automated graders.

---

## Offline vs online eval

- **Offline:** run the eval set pre-deploy. Gate releases on it. This is your regression net.
- **Online:** measure on real traffic — user feedback (thumbs, edits, regenerations, abandonment),
  A/B tests, and production quality sampling. Offline can't cover the real input distribution;
  online catches what your eval set didn't imagine. You need both.

---

## Regression testing & CI

Treat prompts, models, and retrieval config as code under test:

- Run the offline eval set on every change to a prompt / model / chunking / tool.
- **Block the merge/deploy on regressions** past a threshold. A prompt edit that fixes one case
  and breaks three should not ship — and only evals reveal that.
- Pin model versions; re-run evals when a provider updates a model (behavior shifts silently on
  model updates — a real production hazard).
- Log eval scores over time so quality drift is visible.

---

## Observability / tracing

You cannot operate what you can't see. For every LLM/agent interaction, capture:

- Full prompt (with resolved template + injected context), response, model+version, parameters.
- **Token counts and cost** per call; **latency** per call and end-to-end.
- For RAG: the retrieved chunks and scores (so you can see *why* an answer was wrong).
- For agents: the full step trace — actions, tool results, decisions — so a run is **replayable**.
- Errors, retries, fallbacks, guardrail triggers.

This powers debugging, cost attribution, online eval, and incident response. Use a tracing tool
(LangSmith, Langfuse, Phoenix, OpenTelemetry-based, etc.) or roll a structured log — but capture
it from day one; retrofitting observability after an incident is painful.

---

## Cost & latency optimization

Both are design constraints (`SKILL.md`). Levers, roughly in order of payoff:

- **Prompt caching** — cache the stable prefix (system + examples + docs); often the biggest single
  win for repeated calls.
- **Model routing** — cheap/fast model for easy calls, strong model only for hard ones. Route on
  task or on a confidence/complexity signal.
- **Right-size the model** — a smaller (or fine-tuned small) model that passes eval beats an
  oversized one on cost and latency.
- **Trim context** — retrieve narrow, drop dead instructions/examples, compact history. Fewer
  tokens = less cost *and* less latency *and* often better accuracy.
- **Cap output tokens** and stop sequences.
- **Batch / parallelize** independent calls; **stream** to cut *perceived* latency.
- **Semantic cache** repeated/similar queries (below).

Measure before optimizing — trace first, then cut the biggest line item.

---

## Caching

- **Exact-match cache:** identical request → stored response. Trivial, effective for repeated
  identical calls.
- **Semantic cache:** embed the query, return a cached answer if a past query is similar enough
  (threshold-gated). Big savings on FAQ-like traffic; risk of serving a near-but-wrong answer —
  tune the threshold and exclude personalized/volatile queries.
- **Provider prompt cache:** different mechanism (caches the prompt prefix server-side) — use
  alongside your response cache.

---

## Guardrails & safety

Untrusted input and non-deterministic output both need guarding.

- **Prompt injection** — the top LLM-app vulnerability. Any content the model reads (user input,
  retrieved docs, tool/web results, files) may contain instructions trying to hijack it. Defenses,
  layered: delimit and label untrusted content as *data, not instructions*; keep the system prompt
  authoritative; apply least privilege to tools (`agents.md`) so a hijack can't do much; never let
  raw model output trigger a dangerous action without validation/approval. There is no single fix —
  defense in depth.
- **Input guardrails** — validate/limit input; detect obvious injection/abuse before it hits the model.
- **Output guardrails** — before returning/acting on output: schema validation, safety/content
  checks, **PII detection/redaction**, and groundedness checks for RAG (does the answer follow from
  the context, or is it hallucinated?). Block or repair on failure.
- **Jailbreak & abuse** — expect adversarial users; test against it; monitor guardrail triggers.
- **Privacy** — mind what leaves the building. Sensitive data + external API may violate policy;
  that's often the reason to self-host (`model-engineering.md`). Don't log secrets/PII in traces.
- **Hallucination control** — instruct abstention ("say I don't know"), ground with RAG, check
  faithfulness, and surface citations so users can verify.

---

## Prompt & version management

- **Version prompts like code** — in the repo, in review, with history. A prompt change is a
  behavior change.
- **Decouple prompts from code** (templates/registry) so they can be iterated and A/B'd without a
  redeploy — but still versioned and eval-gated.
- **Tie every prompt version to its eval scores** so you know what each change did and can roll back.
- **Pin model + prompt + retrieval config together** as the unit that gets evaluated and shipped;
  changing any one re-triggers eval.
