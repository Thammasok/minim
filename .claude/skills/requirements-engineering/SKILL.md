---
name: requirements-engineering
description: >
  Use this skill for any requirements engineering task — eliciting, analyzing, specifying, validating, or managing software/system requirements. Trigger whenever the user mentions: writing requirements, user stories, use cases, functional or non-functional requirements, acceptance criteria, stakeholder interviews, requirements traceability, requirements review, change requests, scope definition, or user story mapping. Also trigger for phrases like "define what the system should do", "capture stakeholder needs", "write a requirements document", "BRD", "SRS", "MRD", "product requirements", "story map", or "backlog mapping". Covers the full IEEE/IIBA/BABOK-aligned requirements lifecycle — starting with User Story Mapping to establish shared scope, then through elicitation, analysis, specification, validation, and management — with practical techniques and templates.
---

# Requirements Engineering Skill

A comprehensive skill for producing high-quality, traceable, and validated requirements across the full engineering lifecycle.

## When to use this skill
Trigger for any of the following activities:
- Building a User Story Map to define product scope and release slices
- Eliciting needs from stakeholders (interviews, workshops, surveys, observation)
- Analyzing and negotiating conflicting or ambiguous requirements
- Writing specifications: BRD, SRS, MRD, PRD, user stories, use cases
- Validating requirements (reviews, walkthroughs, prototyping)
- Managing requirements: traceability, versioning, change control, prioritization

---

## The Requirements Engineering Lifecycle

**Start here → User Story Mapping → then proceed through phases 1–5.**

---

### Step 0 — User Story Mapping (Start Here)

**Goal:** Build a shared visual understanding of the product scope before writing any individual requirement. This prevents the "flat backlog" problem where stories lose context and sequence.

**What it is:** A 2D map created collaboratively with stakeholders:
- **Horizontal axis (top row)** — User Activities (high-level goals, left to right in workflow order)
- **Second row** — User Tasks (the steps users take within each activity)
- **Vertical axis (below tasks)** — Stories sliced by release priority (top = must-have MVP, lower = later releases)

**Story Map Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│  ACTIVITY 1         │  ACTIVITY 2         │  ACTIVITY 3     │  ← Backbone (user goals)
├─────────────────────┼─────────────────────┼─────────────────┤
│ Task 1.1 │ Task 1.2 │ Task 2.1 │ Task 2.2 │ Task 3.1        │  ← Walking skeleton
├──────────────────────────────────────────────────────────────┤
│  Story A  Story B   │  Story C            │  Story D        │  ← Release 1 (MVP)
├──────────────────────────────────────────────────────────────┤
│  Story E            │  Story F  Story G   │                 │  ← Release 2
├──────────────────────────────────────────────────────────────┤
│  Story H            │                     │  Story I        │  ← Release 3 / backlog
└─────────────────────────────────────────────────────────────┘
```

**How to run a Story Mapping session:**

1. **Set the narrative** — Agree on the user persona(s) and the end-to-end journey being mapped (e.g., "A customer buying a product online")
2. **Identify Activities** — Ask: "What are the big things users do?" (4–8 activities is typical). Write on index cards / sticky notes; place left to right in journey order.
3. **Break into Tasks** — For each activity, ask: "What steps does the user take?" Place tasks below their activity in sequence.
4. **Brain-dump Stories** — For each task, write all the stories you can think of (don't filter yet). Stack them below the task. Use whichever story card format fits your team (see **Story Card Formats** below).
5. **Slice releases** — Draw horizontal lines to group stories into releases. Stories above the first line = MVP; below = future releases. Ask: "What's the minimum set of stories that delivers value end-to-end?"
6. **Validate the map** — Walk the map left to right, top to bottom. Does it tell a coherent user journey? Are there gaps?

**Outputs from Story Mapping:**
- Prioritized, context-aware story backlog (not a flat list)
- Defined MVP scope with rationale
- Identified gaps and missing stories
- Shared team understanding of the user journey
- Release slice plan

**Tools for Story Mapping:**
- Physical: sticky notes, whiteboard, masking tape for swim lanes
- Digital: Miro, FigJam, StoriesOnBoard, FeatureMap, Jira (Story Map view)

**Story Card Formats for the Map:**

Story mapping is format-agnostic. The map is the structure; the card format is just how you write each story. Pick the format that fits your team's context:

| Format | Template | Best For |
|---|---|---|
| **Role-Goal-Benefit** (classic) | As a [role], I want [goal], so that [benefit]. | Agile teams, product backlogs |
| **Job Story** | When [situation], I want to [motivation], so I can [outcome]. | Jobs-to-be-done, context-heavy features |
| **Given/When/Then** | Given [context], when [action], then [result]. | BDD teams, testability-first |
| **Short title only** | [Verb] + [noun] (e.g., "Reset password", "Export report") | Early mapping sessions, sticky notes |
| **Problem statement** | [User] needs a way to [goal] because [problem]. | Discovery phase, innovation work |
| **Shall statement** | The system shall [action] when [condition]. | Regulated/formal contexts (FDA, DO-178) |
| **OKR-style** | Objective: [outcome]. Key result: [measurable signal]. | Strategy-driven roadmaps |

**Guidance:**
- For **early discovery / workshop sessions** — use short titles or problem statements; don't slow the flow with full templates.
- For **agile delivery** — switch to Role-Goal-Benefit or Job Stories once the map is stable and stories move into the sprint backlog.
- For **regulated / safety-critical systems** — use Shall statements throughout so the map directly feeds the SRS.
- You can **mix formats on the same map** — Activities and Tasks are always plain noun phrases; only the story cards below them need a format.

**When to skip / abbreviate:**
- Very small feature (<5 stories, well-understood scope) → go straight to Phase 1
- Maintenance/bug fix work → go straight to Phase 3 (Specification)
- Existing map already exists → review and update it, then continue

---
### Step 0.5 — Elicitation Loop (Story-Level Drill-Down)

**Goal:** For each story on the map, systematically drill from "what" down to
measurable detail — conditions, data, and NFRs — before writing a single formal
requirement. Repeat the loop once per story until all four layers are complete.

**When to run:** After Step 0 (Story Map) is stable. Run one loop per story,
starting with MVP (Release 1) stories, before moving to Phase 1.

---

#### Mode Detection — Domain Expert Skill vs Human-Driven

Before starting the loop, check whether a Business Domain Skill is present in context:

```
IF a domain skill is active (e.g. thai-merchant-logistics-domain):
  MODE = DOMAIN-ASSISTED
  - Domain skill generates initial answer for each layer
  - RE skill challenges, cross-checks, and surfaces gaps
  - Human reviews and approves each layer before advancing
  - Domain skill fills knowledge gaps; human corrects domain errors

ELSE (no domain skill available):
  MODE = HUMAN-DRIVEN
  - RE skill asks human directly at each layer using the question sets below
  - Wait for human response before writing anything
  - Never invent domain answers; only record what human provides
```

In BOTH modes: human review gate is mandatory at every layer.
Domain skill output is a starting point, not a final answer.

---

#### The Loop (one iteration per story)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  STORY: [short title from story map]                                         │
├──────────────┬───────────────────────────────────────────────────────────────┤
│  Layer 1     │  BACKBONE                                                     │
│              │  What does this story do?                                     │
│              │  Ask / generate → human approves → lock                       │
├──────────────┼───────────────────────────────────────────────────────────────┤
│  Layer 2     │  CONDITIONS                                                   │
│              │  What are all the ways this story can end?                    │
│              │  Ask / generate → human approves → lock                       │
├──────────────┼───────────────────────────────────────────────────────────────┤
│  Layer 3     │  DATA                                                         │
│              │  For each condition: what data moves?                         │
│              │  Ask / generate → human approves → lock                       │
├──────────────┼───────────────────────────────────────────────────────────────┤
│  Layer 4     │  NON-FUNCTIONAL                                               │
│              │  What measurable quality thresholds apply?                    │
│              │  Ask / generate → human approves → lock                       │
├──────────────┼───────────────────────────────────────────────────────────────┤
│  Gate        │  All layers approved? YES → story complete, move to next      │
│              │                       NO  → return to failing layer           │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

Repeat for every story. When all MVP stories pass the gate → proceed to Phase 1.

---

#### Layer 1 — Backbone

**Purpose:** Lock the one-line intent before anything else.

**DOMAIN-ASSISTED:** Domain skill proposes actor, goal, and outcome based on
domain knowledge. RE skill checks: Is the actor correct? Is the outcome measurable?

**HUMAN-DRIVEN:** Ask the human:

```
Questions for Layer 1 — Backbone

1. Who performs this action?
   (A person / role? A scheduled job? An external system?)

2. What do they want to achieve in one sentence?

3. What does the system produce when this succeeds?
   (A record? A response? An event? A state change?)

4. Is this one story or actually two separate goals?
```

**Output template:**
```
Story:   [short title]
Actor:   [who initiates]
Goal:    [what they want to achieve]
Outcome: [measurable end state on success]
```

**Human review gate — Layer 1:**
```
Present the filled template to the human:
  "Here is what I understand about this story:
   [show template]
   Is this correct? Type APPROVE to lock Layer 1, or tell me what to change."

Wait. Do not proceed to Layer 2 until human types APPROVE.
```

---

#### Layer 2 — Conditions

**Purpose:** Enumerate every path the story can take.
Conditions become Acceptance Criteria and drive test case generation.

**DOMAIN-ASSISTED:** Domain skill proposes conditions based on known business rules,
edge cases, and exception patterns from the domain. RE skill checks completeness
using the heuristics below.

**HUMAN-DRIVEN:** Ask the human:

```
Questions for Layer 2 — Conditions

We are building the condition table for: [story name]
I will ask about each type one at a time.

SUCCESS cases:
  - What is the minimal valid set of inputs that makes this work?
  - Is there more than one "normal" outcome? (e.g. different user roles)

ALTERNATIVE cases (valid but non-default):
  - What optional features or variants can the user choose?
  - What happens when optional fields are provided vs omitted?
  - Are there different outcomes by user role or permission level?

EXCEPTION cases:
  - What validation rules apply to each input field?
  - What external systems can fail? What should happen when they do?
  - What if this is called twice with the same data?
  - What if the user is not authenticated or not authorized?
  - What is the worst realistic input someone could submit?
```

**Output template — condition table:**

| ID | Type | Trigger / Situation | Expected End State |
|---|---|---|---|
| C-01 | Success | [minimal valid input] | [outcome] |
| C-02 | Alternative | [variant] | [outcome] |
| C-03 | Exception | [invalid input / failure] | [error outcome] |

**Human review gate — Layer 2:**
```
Present the condition table:
  "Here are all the conditions I have identified:
   [show table]
   Are any conditions missing or wrong?
   Type APPROVE to lock Layer 2, or tell me what to add / change."

Wait. Do not proceed to Layer 3 until human types APPROVE.
```

---

#### Layer 3 — Data

**Purpose:** For each condition, name every field that moves.
Concrete field names feed directly into JSON Schema in domain-contract.yaml
and test data in software-tester-design.

**DOMAIN-ASSISTED:** Domain skill proposes field names, types, and constraints
based on industry conventions and known data models. RE skill verifies completeness.

**HUMAN-DRIVEN:** Ask per condition (start with C-01 Success, then others):

```
Questions for Layer 3 — Data
Working on condition: [C-ID] [description]

INPUTS
  - What data must the caller provide? List every field.
  - For each field: what type? (text, number, date, yes/no, list, file, UUID)
  - For each field: required or optional?
  - For each field: any constraints? (max length, allowed values, format)
  - Where does this data come from? (typed by user / from login / from another system)

OUTPUTS
  - What does the system return or show on success?
  - What does the system return or show on failure?
  - Are there any fields that are always present vs conditionally present?

SIDE-EFFECTS (what changes in the system)
  - Is a new record created? In which table/collection?
  - Is an existing record updated? Which fields change?
  - Is a notification or message sent? To whom? Via what channel?
  - Is an event published for other systems to react to?
  - Is any cache or counter updated?
```

**Output template — per condition:**
```
Condition: [C-ID description]

INPUT
  [field_name]   [type]   [required/optional]   [constraint]   [source]

OUTPUT
  [field_name]   [type]   [always/conditional]

SIDE-EFFECTS
  [type]: [description]
```

**Human review gate — Layer 3:**
```
Present the data spec for each condition:
  "Here is the data I have captured for each condition:
   [show per-condition data]
   Are any fields missing, wrong type, or have incorrect constraints?
   Type APPROVE to lock Layer 3, or tell me what to change."

Wait. Do not proceed to Layer 4 until human types APPROVE.
```

---

#### Layer 4 — Non-Functional

**Purpose:** Attach measurable quality thresholds to this story.
These feed into the sla block of domain-contract.yaml and k6 performance targets.

**DOMAIN-ASSISTED:** Domain skill proposes thresholds based on industry benchmarks
and known SLAs for this type of operation. RE skill checks: are these realistic?
are they measurable? do they match stakeholder expectations?

**HUMAN-DRIVEN:** Ask the human:

```
Questions for Layer 4 — Non-Functional
Working on story: [story name]

PERFORMANCE
  - How fast must this respond? (e.g. "under 2 seconds" — then ask: for 99% of requests?)
  - How many requests per second do you expect at peak? (helps size the system)

AVAILABILITY
  - How often can this be down? (e.g. "not more than 1 hour per month" = 99.9%)
  - Is there a time window where downtime is completely unacceptable?

CONSISTENCY
  - After this action succeeds, does the user expect to see the result immediately?
    (YES = strong consistency; small delay OK = eventual consistency)

DATA & COMPLIANCE
  - Does this story store or process personal information? (name, email, phone, ID)
  - Are there regulations that apply? (financial records, medical data, GDPR)
  - How long must this data be kept?

SECURITY
  - Who is allowed to perform this action? (authenticated users only? specific roles?)
  - Should there be a limit on how many times this can be called per minute?

RECOVERY
  - If the system crashes mid-operation, what data must not be lost?
  - How quickly must the system recover before this story works again?
```

**Output template:**
```
Story: [name]

Performance:    latency_p99_ms=[N]  latency_p50_ms=[N]  throughput_rps=[N]
Availability:   availability_pct=[N]
Consistency:    consistency_model=[strong|eventual|causal]
PII:            [true|false]  fields=[list if true]
Retention:      retention_policy=[duration]
Auth:           [none|jwt|api_key|mtls]
Recovery:       rpo_minutes=[N]  rto_minutes=[N]
```

**Human review gate — Layer 4:**
```
Present the NFR template:
  "Here are the quality thresholds I have captured:
   [show template]
   Do these match your expectations? Are any numbers wrong or missing?
   Type APPROVE to lock Layer 4, or tell me what to change."

Wait. Do not proceed to the gate until human types APPROVE.
```

---

#### Story Gate (end of loop iteration)

After all 4 layers are approved, run the completeness checklist:

```
STORY GATE — [story name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Layer 1 — Backbone
  [ ] One actor, one goal, one measurable outcome
  [ ] Not two stories accidentally merged

Layer 2 — Conditions
  [ ] At least one Success condition
  [ ] At least one Exception condition (validation failure)
  [ ] Duplicate/idempotency condition present (if mutating operation)
  [ ] All external dependencies have a "dependency unavailable" condition
  [ ] All user roles considered

Layer 3 — Data
  [ ] Every input field named with type and required/optional
  [ ] Every output field named with type
  [ ] All side-effects listed (DB writes, events, downstream calls)
  [ ] No "TBD" or vague field descriptions remain

Layer 4 — NFR
  [ ] latency_p99_ms is a number (not "fast")
  [ ] availability_pct is a percentage (not "high")
  [ ] consistency_model is one of: strong | eventual | causal
  [ ] PII flag is true or false (never blank)
  [ ] retention_policy is set (even if "indefinite")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All checked → story COMPLETE. Present Story Specification Card below.
Any unchecked → return to that layer, fill in gap, re-run review gate.
```

---

#### Story Specification Card (output)

After gate passes, present this card to the human for final confirmation:

```markdown
## STORY: [name]

**Layer 1 — Backbone**
Actor:   [who]
Goal:    [what]
Outcome: [measurable end state]

**Layer 2 — Conditions**
| ID | Type | Situation | End State |
|---|---|---|---|
| C-01 | Success | ... | ... |

**Layer 3 — Data**
[per-condition data spec]

**Layer 4 — NFR**
[thresholds]

**Traceability**
Story Map ref: [task → release]
Feeds → domain-contract.yaml: api_contracts[operation-id]
Feeds → software-tester-design: TC-xxx through TC-xxx
```

Present the card and ask:
```
"This is the complete specification for [story name].
 Type APPROVE to accept and move to the next story,
 or tell me what to revise."
```

Only advance to the next story after APPROVE.

---

#### Elicitation Loop State Block

Maintain and display this block during Step 0.5:

```
ELICITATION LOOP — [Project name]
Mode: DOMAIN-ASSISTED | HUMAN-DRIVEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ [story name]    — all 4 layers APPROVED
  🔄 [story name]    — Layer 2 IN REVIEW
  ⬜ [story name]    — not started
  ⬜ [story name]    — not started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Waiting for human APPROVE on Layer 2 — Conditions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Legend: `✅ APPROVED` · `🔄 IN REVIEW` · `🔁 REVISING` · `⬜ NOT STARTED`

---

---

**Goal:** Discover and capture stakeholder needs before writing any requirement.

**Elicitation Techniques:**

| Technique | Best For | Output |
|---|---|---|
| Structured Interview | Individual stakeholders, deep dives | Interview notes, raw needs list |
| Focus Group / Workshop | Cross-functional alignment | Affinity diagrams, consensus needs |
| Observation / Job Shadow | Implicit/tacit needs, workflow gaps | Process notes, pain-point list |
| Survey / Questionnaire | Large groups, quantitative data | Prioritized need clusters |
| Document Analysis | Existing systems, regulations | Derived requirements, constraints |
| Prototyping / Mockups | UI/UX needs, vague concepts | Validated user stories |
| Brainstorming | Innovation, early-stage | Raw idea backlog |
| Use Case Workshops | System boundaries, actors | Use case outlines |

**Elicitation Checklist:**
- [ ] Identify all stakeholder roles (users, sponsors, regulators, ops, support)
- [ ] Understand business context and goals
- [ ] Clarify system boundaries (what is in/out of scope)
- [ ] Capture as-is vs. to-be process differences
- [ ] Document assumptions and dependencies
- [ ] Record open issues and follow-ups

**Template — Elicitation Interview Guide:**
```
Project: ___________   Stakeholder: ___________   Date: ___________

1. What is your primary role in this system/process?
2. What are the top 3 problems you need solved?
3. How do you measure success today?
4. What constraints exist (time, budget, tech, regulatory)?
5. What would an ideal outcome look like?
6. Are there edge cases or exceptions I should know about?
7. Who else should I talk to?
```

---

### Phase 2 — Requirements Analysis & Negotiation

**Goal:** Resolve ambiguity, conflicts, and gaps; prioritize and model requirements.

**Analysis Activities:**
- **Gap analysis** — compare as-is vs. to-be; surface missing requirements
- **Conflict resolution** — identify contradictory stakeholder needs; negotiate trade-offs
- **Feasibility assessment** — flag technical, schedule, or budget constraints
- **Decomposition** — break epics/themes into features, features into stories
- **Modeling** — use diagrams to expose implicit logic

**Modeling Techniques:**

| Model | Purpose | Tool |
|---|---|---|
| Context Diagram | System boundary & external actors | Draw.io, Lucidchart |
| Data Flow Diagram (DFD) | Information flows between processes | Visio, Miro |
| Entity-Relationship (ER) Diagram | Data model | dbdiagram.io |
| State Machine / State Chart | Object lifecycle | Miro, PlantUML |
| BPMN Process Flow | Business process logic | Camunda, Lucidchart |
| User Journey Map | End-to-end UX flow | Miro, FigJam |
| Decision Table | Complex conditional logic | Excel, Confluence |

**Prioritization Techniques:**
- **MoSCoW** — Must Have / Should Have / Could Have / Won't Have
- **Kano Model** — Basic needs, performance needs, delighters
- **WSJF (Weighted Shortest Job First)** — Value ÷ cost of delay (SAFe)
- **Dot voting / Planning Poker** — Team-based relative prioritization

**Conflict Negotiation Steps:**
1. State each conflicting requirement explicitly
2. Identify the underlying stakeholder goal behind each position
3. Explore options that satisfy both goals
4. Escalate unresolvable conflicts to sponsor with options + trade-off analysis

---

### Phase 3 — Requirements Specification

**Goal:** Produce clear, complete, consistent, unambiguous, verifiable requirements documents.

#### Functional Requirements (FR)

Define **what** the system must do.

**Format — Shall Statement:**
```
FR-[ID]: The [system/actor] shall [action] [object] [condition/qualifier].
```

**Example:**
```
FR-042: The authentication service shall lock a user account after 5 consecutive
        failed login attempts within a 10-minute window.
```

**Quality Checklist per FR:**
- [ ] **Unambiguous** — one interpretation only
- [ ] **Verifiable** — can be tested with pass/fail
- [ ] **Traceable** — linked to a business need or stakeholder request
- [ ] **Feasible** — technically and economically achievable
- [ ] **Atomic** — one requirement, not a conjunction of two
- [ ] **No implementation detail** (unless intentional constraint)

#### Non-Functional Requirements (NFR)

Define **how well** the system performs. Always include a measurable threshold.

**NFR Categories & Templates:**

| Category | Measurable Template |
|---|---|
| **Performance** | The system shall process [N] transactions per second under [load] with response time ≤ [X ms] at the [P99] percentile. |
| **Availability** | The system shall achieve ≥ [99.9%] uptime measured monthly, excluding scheduled maintenance windows. |
| **Scalability** | The system shall support horizontal scaling to [N] nodes without configuration changes. |
| **Security** | All data at rest shall be encrypted using AES-256. All API calls shall require OAuth 2.0 bearer token authentication. |
| **Usability** | A new user shall be able to complete [core task] in ≤ [N minutes] without assistance, as measured by usability testing with [N] participants. |
| **Reliability / MTTR** | The system shall recover from a single-node failure within [X minutes] with zero data loss. |
| **Maintainability** | The codebase shall achieve a maintainability index score ≥ [X] as measured by [tool]. |
| **Compliance / Regulatory** | The system shall comply with [GDPR / HIPAA / SOC 2 / PCI-DSS / ISO 27001] as applicable. |
| **Portability** | The application shall run on [platforms/OS versions] without modification. |
| **Capacity** | The system shall store up to [X TB] of data with retrieval latency ≤ [Y ms]. |
| **Localization / I18n** | The UI shall support [language list] with full RTL layout support for Arabic and Hebrew. |

#### User Stories (Agile Format)

```
As a [role],
I want to [action/goal],
So that [business value/outcome].

Acceptance Criteria:
  Given [precondition]
  When [trigger/action]
  Then [expected outcome]
  And [additional outcome]
```

**INVEST Checklist for Stories:**
- [ ] **I**ndependent — can be built/shipped alone
- [ ] **N**egotiable — not a contract, open to discussion
- [ ] **V**aluable — delivers value to user or business
- [ ] **E**stimable — team can size it
- [ ] **S**mall — completable within one sprint
- [ ] **T**estable — clear pass/fail criteria

#### Use Case Specification

```
Use Case ID:     UC-[ID]
Use Case Name:   [Verb Noun, e.g., "Process Payment"]
Actor(s):        [Primary Actor] / [Secondary Actor]
Preconditions:   [State of system before use case starts]
Trigger:         [What initiates this use case]
Main Flow:
  1. [Actor does X]
  2. [System responds with Y]
  3. ...
  N. [Use case ends with outcome]
Alternative Flows:
  A1 (step M): [Condition] → [Steps] → [Rejoin at step N or terminate]
Exception Flows:
  E1 (step M): [Error condition] → [System response] → [Recovery or terminate]
Postconditions: [System state after success]
Business Rules:  [Any BR references, e.g., BR-007]
```

#### Document Types & When to Use

| Document | Use When |
|---|---|
| **BRD** (Business Requirements Doc) | Capturing business needs before solution definition |
| **SRS** (Software Requirements Spec) | Formal system-level specification (IEEE 29148) |
| **PRD** (Product Requirements Doc) | Product team scoping for a release |
| **MRD** (Market Requirements Doc) | Market-driven feature prioritization |
| **User Story Backlog** | Agile teams, iterative delivery |
| **Use Case Catalog** | Complex system interactions, formal acceptance |
| **User Flow / Business Flow** | End-to-end journey across actors, systems, and decision points |

---

#### User Flow — End-to-End Business Flow

A User Flow (also called a Business Flow or End-to-End Flow) captures **the complete journey a user or process takes across all touchpoints, actors, and systems** — including decision branches, exception paths, and handoffs between departments or services.

**When to produce one:**
- The process spans multiple systems, teams, or roles
- There are significant decision branches or exception paths that requirements alone won't capture
- Stakeholders need a shared "big picture" before diving into individual stories or specs
- Validating that all edge cases are covered before writing acceptance criteria

**User Flow vs. Related Artifacts:**

| Artifact | Focus | Granularity |
|---|---|---|
| **User Story Map** | Scope & release planning | Feature-level |
| **User Flow / Business Flow** | End-to-end journey, decisions, handoffs | Step-level |
| **Use Case** | One specific interaction in detail | Interaction-level |
| **BPMN Process Diagram** | Formal process with swimlanes & gateways | Task-level |
| **Wireframe / Prototype** | Visual UI representation | Screen-level |

**User Flow Structure:**

```
[Trigger / Entry Point]
        ↓
[Step 1: Actor does X]  →  [System responds Y]
        ↓
   [Decision?] ──── No ────→ [Exception path / Alt flow]
        │ Yes
        ↓
[Step 2: Handoff to Role B / System B]
        ↓
[Step 3: ...]
        ↓
[End State / Outcome]
```

**User Flow Template (Narrative Table format):**

| Step # | Actor / System | Action | System Response | Decision / Branch | Notes |
|---|---|---|---|---|---|
| 1 | Customer | Submits order | Order service validates cart | If cart empty → show error (Step 1a) | |
| 1a | System | Returns validation error | UI displays error message | User corrects → return to Step 1 | Exception path |
| 2 | Order Service | Creates order record | Sends confirmation email | | |
| 3 | Payment Gateway | Processes payment | Returns success/failure | If failure → Step 3a | |
| 3a | System | Payment failed | Notifies customer; holds order | Retry or cancel | |
| 4 | Warehouse System | Picks & packs | Updates inventory | | Handoff to ops |
| 5 | Courier API | Dispatches shipment | Sends tracking number | | End-to-end complete |

**User Flow Writing Guide:**
- **Start with the trigger** — what initiates the flow? (user action, event, schedule, external system)
- **Name every actor explicitly** — user roles, internal systems, external APIs, departments
- **Show every decision point** — if/else branches, validation failures, timeouts
- **Map exception paths** — what happens when things go wrong? Don't just model the happy path
- **Mark system boundaries** — where does data cross from one system/team to another?
- **End with a clear outcome** — what is the measurable end state for each path?
- **Keep steps atomic** — one action per step; split compound steps
- **Number branches** (e.g., 3a, 3b) so they're traceable back to the parent step

**Levels of detail — choose one:**

| Level | Use When | Output |
|---|---|---|
| **High-level flow** (4–8 steps) | Executive alignment, early discovery | Simple linear diagram or narrative |
| **Mid-level flow** (10–20 steps) | Sprint planning, cross-team alignment | Narrative table + flow diagram |
| **Detailed flow** (20+ steps, all branches) | Formal spec, regulated systems, QA test design | Full BPMN or detailed table with all alt/exception paths |

**Connecting flows to other artifacts:**
- Each **step** in a flow can trace to one or more **user stories** or **FRs**
- Each **decision point** should have corresponding **business rules** (BR-xxx)
- Each **exception path** should map to an **NFR** (availability, error handling) or an **alternate use case flow**
- Add flow step references to the RTM: `Flow Step 3 → FR-042, BR-007, TC-019`

---

### Phase 4 — Requirements Validation

**Goal:** Confirm requirements are correct, complete, and approved before development begins.

**Validation Techniques:**

| Technique | Description | When |
|---|---|---|
| **Formal Review / Inspection** | Structured walkthrough with checklist; defects logged | Before baseline |
| **Peer Walkthrough** | Informal author-led reading with stakeholders | Drafts |
| **Prototype Review** | Stakeholders validate against wireframes/mockups | UI-heavy systems |
| **Acceptance Test Design** | Write tests from requirements; gaps reveal missing specs | Before sprint start |
| **Model Validation** | Check data/process models against business rules | Data-heavy systems |
| **Requirements Workshop (Sign-off)** | Live stakeholder session; formal approval | Baselined docs |

**Validation Checklist:**
- [ ] All requirements traceable to a business goal or stakeholder need
- [ ] No contradictions between requirements
- [ ] All NFRs include measurable thresholds
- [ ] All edge cases and exceptions addressed
- [ ] Stakeholders have reviewed and signed off
- [ ] Requirements are technology-neutral (unless constrained)
- [ ] Glossary of terms defined
- [ ] Assumptions documented

---

### Phase 5 — Requirements Management

**Goal:** Maintain requirements integrity throughout the project lifecycle.

**Traceability Matrix (RTM):**

| Req ID | Business Need | Design Doc | Test Case | Status | Priority |
|---|---|---|---|---|---|
| FR-001 | BN-003 | DD-Section 4.2 | TC-015, TC-016 | Approved | Must |
| NFR-007 | BN-010 | DD-Section 6.1 | TC-042 | Draft | Should |

**Change Control Process:**
1. **Request** — Stakeholder submits change request (CR) with rationale
2. **Impact Analysis** — Assess scope, effort, schedule, cost, risk impact
3. **Decision** — Change Control Board (CCB) approves, defers, or rejects
4. **Update** — Requirements document versioned; RTM updated
5. **Communicate** — Affected teams notified; downstream artifacts flagged for update

**Version Control Practices:**
- Use semantic versioning for requirement docs: `v[major].[minor].[patch]`
- Major = baseline change, Minor = new/removed requirement, Patch = clarification
- Lock baselines with stakeholder signatures before development starts
- Track all changes with date, author, and CR reference

**Prioritization for Backlog Management:**
- Maintain living priority order; re-prioritize at each sprint/release planning
- Defer low-priority items with documented rationale, not silent deletion
- Archive (don't delete) rejected requirements with rejection reason

---

## Quick Reference: Common Pitfalls & Fixes

| Pitfall | Fix |
|---|---|
| "The system should be fast" | Add measurable SLA: "response ≤ 2s at P95 under 500 concurrent users" |
| "The system shall support users" | Specify: which users? what actions? under what conditions? |
| Gold-plating (over-specifying) | Tie every requirement to a business need in the RTM |
| Scope creep | Enforce change control; log all additions as CRs |
| Stakeholder conflict left open | Escalate with explicit trade-off options; get a decision documented |
| Requirements written as solutions | Reframe: what problem does this solve? What outcome is needed? |
| Missing NFRs | Systematically review each NFR category; interview ops/security/legal |
| Ambiguous acceptance criteria | Use Given/When/Then format; have a developer write a test case as validation |

---

## Tools Reference

| Activity | Tools |
|---|---|
| Requirements management | Jira, Azure DevOps, IBM DOORS, Helix RM, Confluence |
| Modeling & diagrams | Lucidchart, Draw.io, Miro, PlantUML, Visio |
| User flows & business flows | Miro, FigJam, Lucidchart, Whimsical, Overflow |
| Prototyping | Figma, Balsamiq, Axure, Marvel |
| Test management | Zephyr, TestRail, Xray, qTest |
| Document collaboration | Confluence, Notion, Google Docs, SharePoint |
| Traceability | Jama Connect, IBM DOORS, Polarion, Orcanos |

---

## Output Formats

When producing requirements deliverables, ask which format is needed:
- **Structured table** — FR/NFR ID list for import into tools
- **Prose document** — BRD/SRS/PRD narrative format
- **User story backlog** — Markdown stories with acceptance criteria
- **Use case catalog** — Structured use case specs
- **User flow / business flow** — End-to-end journey table with decision branches, actors, and system handoffs
- **RTM** — Traceability matrix in table form
- **Review checklist** — Validation checklist for a specific doc

For large documents, read the `docx` skill at `/mnt/skills/public/docx/SKILL.md` before generating Word output.

---


## Artifacts Produced

Save output files at these paths before handing off:

- `docs/{feature}/{version}/requirements.md` — actors, use cases, FR/NFR, acceptance criteria and
  open questions, all in **one** document (not one file per story)
- `docs/overview/story-map.md`, `docs/overview/nfr.md` — living cross-slice docs, stay Markdown

See `skill-orchestrator` for the full project path structure.

> **Repo house rule (Cadence) — artifacts are structured Markdown.**
> Phase artifacts live at `docs/{feature}/{version}/requirements.md` — one file per phase, Markdown with
> YAML front matter. Follow the conventions in `.claude/skills/solution-planner/SKILL.md`.

## Skill hand-offs: downstream skills

Once requirements are defined, the following skills pick up where this one leaves off:

### → software-tester-design
Use when the user needs to turn acceptance criteria and user stories into structured
test cases (TC-xxx). That skill covers:
- Deriving test cases from acceptance criteria using EP, BVA, Decision Tables, State Transition
- Mapping story map slices to test levels (unit, API, E2E)
- Test data design, coverage matrices, and risk-based prioritisation
- User Story Mapping from a test design perspective (the `bdd.md` reference)

**Hand-off point:** Acceptance criteria are written and signed off → hand to `software-tester-design`.

### → solution-architecture
Use when requirements reveal significant architectural decisions — bounded contexts,
scalability constraints, integration patterns, or technology choices. That skill covers:
- Translating NFRs (performance, availability, security) into architectural quality attributes
- Selecting architecture styles (monolith, microservices, event-driven, CQRS)
- DDD bounded context mapping from domain requirements
- ADR production for key architectural decisions

**Hand-off point:** NFRs and system boundaries defined → hand to `solution-architecture`.

### → software-engineer-backend / react-vite-developer
Use when requirements are ready to implement. Those skills carry implementation patterns,
project structure, and technology-specific conventions.

**Hand-off point:** Stories baselined and sprint-ready → hand to the relevant engineering skill.
