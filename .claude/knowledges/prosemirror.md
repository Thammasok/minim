---
name: prosemirror
description: Use when working with ProseMirror-based rich text editors — schema design (NodeSpec/MarkSpec), EditorState/transactions, plugins, commands, and node views. This is the engine underlying this repo's Tiptap editor (see web/src/components/tiptap-node/).
---

# ProseMirror

## Purpose
ProseMirror is a toolkit (not a framework) for building rich, structured text editors on top of `contentEditable`. It models the document as an immutable tree, applies changes as recordable/replayable transforms, and renders via a DOM-syncing view. Tiptap wraps ProseMirror's four core modules; anything under `tiptap-node/*-extension.ts` in this repo is ultimately defining ProseMirror `NodeSpec`/`MarkSpec` and commands.

## When to Apply
- Adding or modifying a Tiptap node/mark extension (`web/src/components/tiptap-node/**`) and need to reason about `NodeSpec`, content expressions, or `toDOM`.
- Debugging editor state issues: selection, document structure, or why a transaction didn't apply.
- Writing a custom command, keymap binding, or input rule for the editor.
- Building a custom plugin that needs its own state slice (`PluginKey`) or DOM decorations.

## Core Concepts (4 modules)
- **prosemirror-model** — the document data structure: `Node`, `Schema`, `Fragment`, `Mark`. Documents are immutable trees.
- **prosemirror-state** — `EditorState` (persistent, not mutated) and `Transaction`. A new state is always computed via `state.apply(tr)`, never mutated in place.
- **prosemirror-view** — `EditorView`: renders a state to the DOM and turns DOM/browser events into transactions.
- **prosemirror-transform** — recordable, replayable document changes (`Transaction` extends this), which is what makes undo history and collaborative editing possible.

## Schema Design

### NodeSpec / content expressions
```javascript
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", toDOM() { return ["p", 0] } },
    blockquote: { group: "block", content: "block+" },
    text: { inline: true },
  },
})
```
- `content` is a **content expression**: quantifiers `+ * ? {2} {1,5}`, sequencing, and `|` for alternatives.
- `group` lets other nodes reference a whole set (`"block"`) instead of enumerating types — this is how `doc: {content: "block+"}` stays extension-agnostic when new block-level nodes (e.g. this repo's horizontal-rule node) are added.
- `toDOM(node)` returns a DOM spec array; the `0` marks the "content hole" where children render. Leaf nodes (no children) omit the hole, e.g. `["hr"]`.
- Every schema needs exactly one top-level node (usually `doc`) and a `text` node type.
- A node's `inline`, `atom`, `selectable`, `draggable` flags on `NodeSpec` control editing behavior (e.g. a horizontal-rule/image node is typically `group: "block"`, non-inline, `atom: true` since it has no editable content).

## State & Transactions
`EditorState` is persistent/immutable — mutating methods don't exist; you always derive a new state:
```javascript
let state = EditorState.create({ schema, plugins })
let view = new EditorView(dom, {
  state,
  dispatchTransaction(tr) {
    const newState = view.state.apply(tr)
    view.updateState(newState)
  },
})
```
- `state.tr` / `state.tr()` starts a new transaction from the current state.
- `state.apply(tr)` → new `EditorState`; `state.applyTransaction(tr)` is the verbose variant returning the actual transactions applied (useful when a plugin's `appendTransaction` adds more).
- Never hold onto a stale `EditorState` reference across renders — always read `view.state` at dispatch time (see the `dispatchTransaction` pattern above), since another transaction may have landed first.

## Plugins
- `new Plugin({ key, state, props })` — `state` gives the plugin its own reducer-like state slice (`init`/`apply`), `props` can add decorations, event handlers, etc.
- `PluginKey` tags a plugin instance so you can look it up later (`myPluginKey.getState(state)`) and guarantees only one instance of that plugin type is active — use this instead of scanning `state.plugins`.
- Built-in plugins commonly composed together:
  - `history()` + `keymap({"Mod-z": undo, "Mod-y": redo})` from `prosemirror-history` — undo/redo.
  - `keymap(baseKeymap)` from `prosemirror-commands` — Enter/Backspace/etc. baseline editing behavior.
  - `inputRules({ rules })` from `prosemirror-inputrules` — trigger an action when typed text matches a pattern (e.g. `--- ` → horizontal rule, `# ` → heading).

## Commands
A **command** is a function `(state, dispatch?, view?) => boolean`:
- Returns `false` if the command isn't applicable in the current state (used to disable toolbar buttons).
- When applicable and `dispatch` is provided, it dispatches a transaction and returns `true`; when `dispatch` is omitted, it's a dry-run applicability check.
- `keymap()` bindings and Tiptap's own command chains are both built on this shape — keep custom commands consistent with it rather than reaching into `view.dispatch` directly from UI code.

## Checklist
- [ ] New block-level node/mark is added to the right `group` so `content` expressions elsewhere don't need to change
- [ ] `toDOM`/`parseDOM` are symmetric (what you render is what you can parse back on paste/load)
- [ ] Leaf/atom nodes (no editable content) are marked `atom: true` and have no content hole in `toDOM`
- [ ] State reads happen off `view.state` at dispatch time, not a captured closure variable
- [ ] Custom plugin state uses a `PluginKey` for lookup rather than iterating `state.plugins`
- [ ] Custom commands follow the `(state, dispatch?, view?) => boolean` shape

## Reference
Fetched via context7 from `/websites/prosemirror_net` (prosemirror.net/docs). For anything beyond this summary — collaborative editing internals, full `Transform` step types, decorations API — query context7 again rather than relying on training data, since ProseMirror's API surface shifts across versions.
