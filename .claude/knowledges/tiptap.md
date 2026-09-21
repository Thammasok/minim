---
name: tiptap
description: Use when working with Tiptap (v3) rich text editor extensions, React integration, or command chains. This repo uses @tiptap/core, @tiptap/react, and @tiptap/starter-kit under web/src/components/tiptap-node/ — see also [[prosemirror]], the engine Tiptap wraps.
---

# Tiptap

## Purpose
Tiptap is a headless, framework-agnostic rich text editor built on top of ProseMirror (see [[prosemirror]]). It wraps ProseMirror's `Schema`/`NodeSpec`/`MarkSpec`/plugin concepts in a declarative `Node.create()`/`Mark.create()`/`Extension.create()` API, plus a React binding (`@tiptap/react`) for hooks and node views. This repo pins `@tiptap/*` to `^3.30.x` — use v3 docs/APIs, not v2 (option names and some extension configs changed between major versions, e.g. StarterKit's `undoRedo` toggle).

## When to Apply
- Adding/modifying a node or mark extension under `web/src/components/tiptap-node/**` (e.g. `horizontal-rule-node-extension.ts`).
- Customizing `renderHTML`/`parseHTML` for an existing `@tiptap/extension-*` package via `.extend()`.
- Building a custom node view (React component rendered inside the editor for a given node type).
- Wiring toolbar buttons/commands against `editor.chain()...run()`.
- Configuring `StarterKit` or any extension's options.

## Extending an Existing Extension
The repo's own pattern (`horizontal-rule-node-extension.ts`) — start from a published extension and override only what differs, rather than redefining the whole node from scratch:
```typescript
import { mergeAttributes } from '@tiptap/react'
import TiptapHorizontalRule from '@tiptap/extension-horizontal-rule'

export const HorizontalRule = TiptapHorizontalRule.extend({
  renderHTML() {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, { 'data-type': this.name }),
      ['hr'],
    ]
  },
})

export default HorizontalRule
```
`mergeAttributes(...)` combines the extension's configured `HTMLAttributes` with any per-call attributes — always use it in `renderHTML` rather than hand-merging objects, so consumers who `.configure({ HTMLAttributes: {...} })` aren't silently overridden.

## Creating a New Node/Mark From Scratch
```typescript
import { Node, mergeAttributes } from '@tiptap/core'

export const CustomNode = Node.create({
  name: 'customNode',

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-type'),
        renderHTML: (attrs) => (attrs.type ? { 'data-type': attrs.type } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-custom]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-custom': '' }), 0]
  },
})
```
- The trailing `0` in `renderHTML`'s returned array is the ProseMirror "content hole" — omit it for leaf/atom nodes (mirrors ProseMirror's `NodeSpec.toDOM`, see [[prosemirror]]).
- `addAttributes()` maps to ProseMirror `NodeSpec.attrs`; each attribute needs `parseHTML`/`renderHTML` to round-trip through the DOM.
- Other lifecycle hooks available on the same config object: `addCommands()`, `addKeyboardShortcuts()`, `addInputRules()`, `addNodeView()`, `addPasteRules()`, `addProseMirrorPlugins()` — reach for `addProseMirrorPlugins()` only when you need raw ProseMirror plugin state ([[prosemirror]]'s `PluginKey`), not for anything Tiptap already exposes a dedicated hook for.

## React Node Views
For a node that needs arbitrary React UI inside the editor (not achievable via `renderHTML` alone):
```typescript
import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import Component from './component'

export default Node.create({
  // ...schema config
  addNodeView() {
    return ReactNodeViewRenderer(Component)
  },
})
```
```tsx
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'

export default function Component() {
  return (
    <NodeViewWrapper className="react-component">
      <span contentEditable={false}>Label</span>
      <NodeViewContent className="content" />
    </NodeViewWrapper>
  )
}
```
- Always wrap the component root in `NodeViewWrapper` — it's what registers the DOM node with ProseMirror's view.
- `NodeViewContent` marks the editable child region for nodes with content; omit it for atom nodes.
- The component receives `editor`, `node`, `decorations`, `selected`, `getPos()`, `updateAttributes()`, `deleteNode()` as props — use `updateAttributes()`/`deleteNode()` rather than dispatching a transaction manually.
- `ReactNodeViewRenderer(Component, { trackNodeViewPosition: true })` re-renders on every position change — only enable when the component actually needs its live document position; it has a performance cost.

## Commands & Chaining
```typescript
editor.chain().focus().toggleBold().run()
editor.chain().focus().toggleHeading({ level: 2 }).run()
editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
```
- `.chain()` queues commands into **one transaction**, so the document updates once and `update` fires once — prefer this over calling multiple single commands (`editor.commands.x()`) back to back.
- Start toolbar-triggered chains with `.focus()` so the editor regains focus after a button click.
- `editor.isActive('bold')` / `editor.isActive('heading', { level: 1 })` drive toggle/active button state — check against the exact attrs you set, not just the mark/node name, when the extension takes attributes.

## Configuring Extensions / StarterKit
```typescript
import StarterKit from '@tiptap/starter-kit'

new Editor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      undoRedo: false, // disable a bundled extension to swap in a custom one
    }),
  ],
})
```
`StarterKit.configure({ <extensionName>: false })` disables a bundled extension (e.g. to replace it with a customized `.extend()` version like this repo's `HorizontalRule`); `{ <extensionName>: { ...options } }` passes that extension's own options through.

## Checklist
- [ ] Extending a published extension (`.extend()`) rather than reimplementing it, unless behavior genuinely diverges
- [ ] `renderHTML` uses `mergeAttributes()`, not manual object spreads, so `.configure({ HTMLAttributes })` isn't silently dropped
- [ ] Attribute `parseHTML`/`renderHTML` pairs round-trip correctly (paste/reload preserves the attribute)
- [ ] Atom/leaf nodes omit the content-hole `0` in `renderHTML`
- [ ] React node views wrap content in `NodeViewWrapper`, use `NodeViewContent` only when the node has editable children
- [ ] Multi-step edits triggered from UI go through `.chain()...run()`, not sequential single commands
- [ ] Toolbar active-state checks (`isActive`) match the exact attrs the button sets, not just the type name

## Reference
Fetched via context7 from `/websites/tiptap_dev` (tiptap.dev/docs), scoped to v3 (matches this repo's `^3.30.x` pin). For anything beyond this summary — collaboration/AI extensions, the full commands API, migration notes from v2 — query context7 again rather than relying on training data, since option names and defaults have changed across major versions.
