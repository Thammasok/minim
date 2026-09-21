# AI Agents

An agent is an LLM in a loop that can **observe results and decide the next step**. That freedom
is the whole value — and the whole risk. Reach for an agent only when the path genuinely varies;
if the steps are fixed, write a deterministic chain and keep the reliability.

## Contents
- Agent vs workflow (decide first)
- Architectures
- The agent loop
- Tool design for agents
- Memory
- Multi-agent
- Human-in-the-loop & guardrails
- MCP
- Harness / control-plane patterns
- Reliability & failure modes

---

## Agent vs workflow (decide this first)

- **Workflow / chain:** you know the steps in advance. LLM calls wired in a fixed graph
  (extract → classify → route → respond). Predictable, testable, cheap, debuggable. **Default to
  this.** Most "agent" requests are actually workflows.
- **Agent:** the model decides the sequence at runtime based on intermediate results, because the
  path can't be known ahead of time (open-ended research, debugging, "do X" where X varies).

Ask: *do I actually not know the steps in advance?* If you can draw the flowchart, build the
flowchart. Agents trade determinism for flexibility — only pay that when you need it. A hybrid
(deterministic skeleton with an agentic step where it's genuinely open-ended) is often best.

---

## Architectures

- **ReAct (reason + act):** the workhorse loop — think → call a tool → observe → think → … →
  answer. Simple, transparent, effective for most tool-using tasks.
- **Plan-then-execute:** make a plan up front, then execute steps (optionally re-planning on
  failure). Better for multi-step tasks where jumping straight to acting wanders; costs an extra
  planning call.
- **Reflection / self-critique:** the agent critiques its own output and revises. Raises quality
  on generation/reasoning tasks; adds calls — gate it behind a quality check, don't always run it.
- **Router:** classify the request, dispatch to a specialized handler/sub-agent. Often the
  highest-value "agentic" pattern and the cheapest.

Start with the simplest (router or ReAct). Add planning/reflection only when evals show the
simple loop failing on real tasks.

---

## The agent loop

```
context = system_prompt + tools + task
loop (until done or max_steps):
    action = model(context)              # a tool call or a final answer
    if action is final answer: return it
    result = execute(action)             # run the tool, validate args first
    context += (action, result)          # observe
    enforce budget: max_steps, max_tokens, max_$, wall-clock
```

Non-negotiables:
- **Hard stop conditions.** `max_steps`, token/$ budget, and a timeout. An unbounded agent loop is
  a runaway cost and latency incident waiting to happen. This is the #1 production agent failure.
- **Every tool result is observed context.** Errors included — a good error message lets the agent
  recover; a swallowed one makes it loop.
- **Detect loops.** Same action + same result twice → break out, don't repeat forever.
- **Compaction.** Long loops overflow context; summarize/prune old steps (see Memory).

---

## Tool design for agents

Tools are the agent's hands. Same rules as `llm-app-engineering.md`, amplified because the agent
chains them autonomously:

- **Clear, orthogonal, well-described.** The description is the only spec the model has. Ambiguous
  or overlapping tools cause wrong choices that compound over a loop.
- **Right granularity.** Too fine (10 calls to do one thing) wastes steps; too coarse (one
  do-everything tool) hides control. Match a tool to a meaningful unit of work.
- **Return recoverable errors.** `"No user with id 5. Did you mean 15?"` beats `500`. The agent
  reads it and self-corrects.
- **Guard side effects and make them idempotent.** The agent *will* eventually call the dangerous
  tool at the wrong time. Validate, authorize, confirm destructive actions (human-in-the-loop),
  and ensure a retried action doesn't double-execute.
- **Least privilege.** Give an agent only the tools and scopes its task needs. Broad tool access +
  untrusted input = an exfiltration/abuse path.

---

## Memory

- **Short-term (working):** the running context of this task/conversation. Bounded by the window,
  so **compact**: summarize old turns, keep recent turns verbatim, keep a running "state" block of
  key facts/decisions. Don't just truncate — you'll drop the goal.
- **Long-term:** persists across sessions. Usually retrieval over past interactions/notes (RAG on
  memory — see `rag.md`) plus a small structured store (user prefs, entities). Write deliberately;
  don't dump everything.
- **Scratchpad / state file:** for long tasks, an explicit external state the agent reads/writes
  each step beats cramming state into the prompt — more reliable and inspectable.

---

## Multi-agent

Multiple specialized agents (orchestrator + workers, or a pipeline). Powerful but expensive and
harder to debug — coordination overhead, error propagation, exploding token cost.

- **Use it when** subtasks are genuinely separable and benefit from specialization/parallelism
  (e.g. parallel research across sources, then synthesize).
- **Avoid it when** a single well-prompted agent with good tools would do. Multi-agent is often
  premature complexity.
- **Patterns:** orchestrator-workers (a lead decomposes and delegates), or a fixed pipeline of
  specialists. Keep communication structured and bounded; don't let agents free-chat.

---

## Human-in-the-loop & guardrails

- **Approval gates** on destructive or costly actions (send email, spend money, delete, deploy).
  The agent proposes; a human confirms.
- **Bounded autonomy:** the more irreversible the action, the tighter the leash.
- **Input/output guardrails:** validate what goes in (injection defense) and what comes out
  (safety, PII, schema) — see `evaluation-and-llmops.md`. An agent that acts on untrusted content
  (web pages, emails, user docs) is a prime prompt-injection target: treat retrieved/tool content
  as untrusted data, never as instructions.

---

## MCP (Model Context Protocol)

A standard protocol for exposing tools/data to LLM apps as reusable **servers**, instead of
hand-wiring every integration into every app.

- **Use it to** make a capability (a DB, an API, a file store) available to any MCP-aware client
  once, rather than re-implementing tool glue per app. Good fit for a shared internal tool layer
  or a product that plugs into others' agents.
- An MCP tool is still just a tool to the model — all tool-design rules above apply. MCP
  standardizes *transport and discovery*, not tool quality.
- Same least-privilege and untrusted-content cautions apply, more so, because servers are shared.

---

## Harness / control-plane patterns

The "harness" is the engineered scaffold around the model: the loop, tool routing, context
assembly, budgets, logging, retries, and policy. For anything beyond a toy, the harness is where
the real engineering lives — the model is a component inside it.

- **Separate policy from mechanism:** budgets, allowed tools, and stop conditions are config, not
  hardcoded in the loop.
- **Make every step observable:** log each action, tool result, and token cost (tracing —
  `evaluation-and-llmops.md`). You cannot debug an agent you can't replay.
- **Keep it model-portable:** the harness owns the loop; the model plugs in behind the client
  abstraction (`llm-app-engineering.md`) so you can swap or route models.
- **Deterministic seams:** wrap the agentic part in deterministic pre/post steps you can test.

---

## Reliability & failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Runs forever / huge bill | no stop conditions | hard `max_steps`, token/$/time budgets |
| Repeats the same failing action | error swallowed; no loop detection | return informative errors; detect repeats and break |
| Picks the wrong tool | vague/overlapping tool descriptions | rewrite descriptions; reduce/orthogonalize tools |
| Loses the goal on long tasks | naive context truncation | compact with a persistent state/goal block |
| Acts on injected instructions | treats tool/web content as commands | delimit + treat as untrusted data; guardrails; least privilege |
| Great in demo, flaky in prod | evaluated on happy path only | eval on adversarial + multi-step traces (`evaluation-and-llmops.md`) |
| Slow / expensive | too many steps; no cheap-model routing | tighten tools; route easy steps to a cheaper model; cache |
