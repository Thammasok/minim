# Model Engineering

Working *at the model level*: deciding whether to fine-tune, doing it efficiently, and serving
models yourself. Most applied AI never needs this — prompting + RAG covers the majority. Reach
here when you have a measured reason.

## Contents
- Fine-tune vs RAG vs prompt (decide before you train)
- Fine-tuning approaches (full, LoRA/QLoRA, preference)
- Dataset preparation (where success is decided)
- Serving models (vLLM, TGI, Ollama)
- Quantization
- Local vs cloud economics
- Embedding models (hosting)

---

## Fine-tune vs RAG vs prompt (decide before you train)

Fine-tuning changes the model's **weights** to shape *behavior/form/style/skill*. It does **not**
reliably add *facts* — and it can't add facts that change. This is the most common misconception,
so anchor on it:

- **Need fresh/changing/private facts →** RAG (`rag.md`). Fine-tuning to "teach it our docs" is
  the classic expensive mistake.
- **Need different behavior/format/tone on general knowledge →** try prompting + few-shot first.
  Iterating a prompt takes minutes; a fine-tune takes a dataset, a training run, and eval.
- **Fine-tune when, and only when:** prompting has plateaued *and* you have labeled examples,
  and at least one of:
  - a **consistent style/format/persona** you can't reliably prompt into place,
  - a **specialized skill/domain** (classification, extraction schema, a narrow reasoning task)
    where a smaller tuned model matches a big prompted one,
  - **cost/latency at scale** — a fine-tuned small model can replace a big model + huge prompt,
    cutting per-call tokens dramatically,
  - a **capability the base model lacks** (rare for applied work).

Order of preference: **prompt → RAG → prompt+RAG → fine-tune**. And often *fine-tune + RAG*
together (tune the behavior, retrieve the facts) beats either alone.

Requirements before committing: an **eval set** (you can't tell if tuning helped without one) and
**enough quality data** (hundreds to thousands of good examples, not dozens of mediocre ones).

---

## Fine-tuning approaches

- **Full fine-tuning:** update all weights. Max capacity, but heavy compute/memory and a full-size
  checkpoint per model. Rarely necessary for applied work.
- **LoRA / QLoRA (PEFT):** train small adapter matrices; freeze the base. **The default.** ~1% of
  the parameters, runs on modest GPUs (QLoRA quantizes the base to 4-bit so a large model tunes on
  a single GPU), and adapters are tiny and swappable. Start here.
- **Preference tuning (DPO/RLHF-style):** align to human preference beyond input→output pairs
  (helpfulness, tone, safety). More involved; use when SFT quality isn't enough. DPO is the
  simpler, common choice over full RLHF for most teams.

Guidance: begin with LoRA/QLoRA SFT on a clean dataset; add preference tuning only if a measured
quality gap remains. Track base-model + adapter versions like code.

---

## Dataset preparation (where success is decided)

Model quality is dataset quality. This is 80% of the work and where fine-tunes succeed or fail.

- **Quality ≫ quantity.** A few hundred clean, consistent, representative examples beat thousands
  of noisy ones. Every bad label teaches the wrong thing.
- **Match production distribution.** Train on the inputs the model will actually see, including
  edge cases. Off-distribution data yields a model that shines in eval and flops in prod.
- **Exact target format.** The completions must be *exactly* the output you want (schema, style,
  length). The model learns to imitate them precisely — including their mistakes.
- **Consistency.** Contradictory examples (same input, different style/answer) confuse the model.
  Enforce one convention.
- **Hold out a test split** the model never trains on, for honest eval (`evaluation-and-llmops.md`).
- **Watch for leakage** between train and test, and for accidental PII in training data.

---

## Serving models (self-hosting)

For on-prem/privacy or cost-at-scale, you run the model. Pick the server for the job:

- **vLLM** — high-throughput production inference (PagedAttention, continuous batching). The
  default for serving open models at scale; exposes an OpenAI-compatible API so it drops into the
  same client abstraction as cloud (`llm-app-engineering.md`).
- **TGI (Text Generation Inference)** — HuggingFace's production server; similar niche, strong HF
  ecosystem fit.
- **Ollama** — dead-simple local/dev serving of quantized (GGUF) models on a laptop or a modest
  box; OpenAI-compatible endpoint. Ideal for local development, prototyping, small on-prem loads,
  and privacy-first single-node deploys. Not built for high-concurrency production — graduate to
  vLLM/TGI when throughput matters.

What actually governs serving in production: **GPU memory** (model size + KV cache + batch),
**throughput vs latency** (batching helps throughput, can hurt single-request latency),
**concurrency** (continuous batching), and **context length** (KV cache grows with it). Size
hardware to these, not to parameter count alone. Verify current model support/flags via Context7.

---

## Quantization

Reduce weight precision (16-bit → 8/4-bit) to shrink memory and speed inference, trading a little
quality.

- **GGUF** (llama.cpp/Ollama) — CPU/consumer-GPU friendly; the local-inference default.
- **AWQ / GPTQ** — 4-bit for GPU serving (vLLM/TGI) with good quality retention.
- **Rule of thumb:** 4-bit often keeps most quality at ~¼ the memory — usually worth it for
  self-hosting. Below 4-bit, quality drops off faster; test on your eval set.
- Quantization is what lets a big open model run on hardware you can actually afford. Always
  re-run evals after quantizing — never assume the drop is negligible.

---

## Local vs cloud economics

Decide with numbers, not ideology.

- **Cloud API:** zero ops, always-current models, pay per token. Best at low/spiky volume,
  when you want frontier quality, and when data-egress is allowed. Cost scales linearly with use.
- **Self-hosted:** fixed GPU cost (own or rent), full data control (on-prem/privacy), no per-token
  fee. Wins at high steady volume and when data *cannot leave* (the common driver in regulated /
  on-prem deployments). You own uptime, scaling, and upgrades.
- **Break-even** is a real calculation: (tokens/month × API price) vs (GPU $/month + ops). High
  sustained volume or hard privacy requirements push toward self-hosting; everything else usually
  starts on an API.
- **Hybrid** is common and pragmatic: prototype on an API, self-host the hot path, keep a cloud
  fallback — the client abstraction makes this a config change.

---

## Embedding models (hosting)

Same local-vs-cloud logic for the embeddings that power RAG (`rag.md`):

- **Self-host** an open embedding model (via a small inference server or the vector stack) for
  privacy/on-prem and to avoid per-embedding fees at scale — important because RAG re-embeds whole
  corpora and every query.
- **Hosted embeddings API** for convenience at low volume.
- Multilingual/Thai corpora: choose an embedding model proven on that language; verify on your own
  data. Changing the embedding model = re-embed everything, so choose deliberately up front.
