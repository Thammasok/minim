# React Flow (@xyflow/react)

Node-based UI — flow editors, diagrams, pipeline builders, node graphs. This file captures the
patterns and footguns that don't change between releases. For exact current prop names, new hooks,
and version-specific behavior, **query Context7 for `/websites/reactflow_dev`** rather than trusting
a frozen API surface here — the library moves and this file will drift.

Contents: [Package & CSS](#package--css) · [The mental model](#the-mental-model) ·
[State ownership](#state-ownership--the-decision-that-matters) · [Custom nodes](#custom-nodes) ·
[Reaching the instance](#reaching-the-instance) · [Performance](#performance) ·
[Tailwind integration](#tailwind-integration) · [Footguns](#footguns)

## Package & CSS

The package is **`@xyflow/react`** (React Flow v12+). The old `react-flow-renderer` and `reactflow`
(v11) names are the previous incarnations — if you find them in a project, it's on an old major.
Confirm the current install line via Context7 before scaffolding; the package rename is exactly the
kind of fact that goes stale.

```bash
npm i @xyflow/react
```

The stylesheet is **not optional** — without it nodes render unpositioned and the pane is unusable.
Import it once, globally:

```ts
import '@xyflow/react/dist/style.css';
```

## The mental model

React Flow is a **controlled component** by default. You own the `nodes` and `edges` arrays; it
tells you about drags, connections, selections, and deletions through change handlers, and you
apply those changes back. It does not mutate your state for you.

That framing is why the state-ownership decision below is the whole ballgame. Get it right and
everything composes; get it wrong and you fight the library on every interaction.

```tsx
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import { useCallback } from 'react';
import '@xyflow/react/dist/style.css';

const initialNodes = [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }];
const initialEdges = [];

export function Flow() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

**The container must have an explicit height.** React Flow fills its parent, and a parent with
`height: auto` collapses to zero — the canvas is there but invisible. This is the first thing to
check when "nothing renders."

`useNodesState`/`useEdgesState` are convenience wrappers over `useState` + `applyNodeChanges`. When
you need custom logic on changes, drop to the explicit form:

```tsx
const onNodesChange = useCallback(
  (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
  [],
);
```

## State ownership — the decision that matters

This connects directly to the SKILL.md principle on separating server state from client state, and
it's where most React Flow architectures go wrong.

**Node positions and edges are client UI state, and React Flow's own state should be the source of
truth for them.** Do not mirror the live node array into Zustand or Redux and try to keep the two
in sync — you'll write change-reconciliation logic the library already owns, and drag performance
will suffer because every mouse-move round-trips through your store.

Reach for an external store (Zustand is the common choice) only when state genuinely lives *outside*
the canvas — a sidebar that edits the selected node, an undo/redo stack, collaborative cursors, a
"dirty" flag for save. Even then, keep React Flow driving positions and let the store hold the
higher-level intent.

When you do use Zustand, wire the change handlers into the store and select narrowly with
`useShallow` (see `state.md`) so a drag doesn't re-render the whole app:

```ts
// store.ts — the store holds the graph, React Flow drives interaction
const useFlowStore = create<FlowState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (conn) => set({ edges: addEdge(conn, get().edges) }),
}));
```

**The graph is server state when it's persisted.** Loading a saved flow from an API and saving edits
back is TanStack Query territory (see `data-fetching.md`): the query hydrates the initial
nodes/edges, a debounced mutation persists changes. The distinction holds — Query owns the
round-trip to the database, React Flow owns the live interaction, and you sync at the boundaries
(on load, on save) rather than on every frame.

## Custom nodes

A custom node is just a React component that receives `data` and renders `Handle`s for its
connection points. Two rules keep them fast and correct:

1. **Register `nodeTypes` outside the component or behind `useMemo`.** A fresh object each render
   makes React Flow re-mount every node, which tanks performance and logs a warning. This is *the*
   most common React Flow mistake.
2. **Wrap the node component in `memo()`.** Without it, every node re-renders whenever any node
   changes.

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

export const TextNode = memo(({ data }: NodeProps<{ label: string }>) => (
  <div className="rounded-md border border-border bg-surface px-4 py-2 shadow-sm">
    <Handle type="target" position={Position.Top} />
    <span className="text-sm">{data.label}</span>
    <Handle type="source" position={Position.Bottom} />
  </div>
));
```

```tsx
// outside the component — defined once
const nodeTypes = { text: TextNode };

function Flow() {
  return <ReactFlow nodeTypes={nodeTypes} /* ... */ />;
}
```

`edgeTypes` follows the identical rule — define once, never inline.

**Keep `node.data` small.** It's serialized, diffed, and passed around on every change. Store an id
in `data` and look the heavy object up from a store or query cache; don't stuff a whole record,
image blob, or nested tree in there. Multiple `Handle`s on one side need unique `id`s so edges know
which port they connect to.

## Reaching the instance

Any component that calls a React Flow hook must sit inside a provider. When you need hooks *outside*
`<ReactFlow>` — a sidebar, a toolbar, a save button — wrap the subtree in `ReactFlowProvider`:

```tsx
import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';

function Toolbar() {
  const rf = useReactFlow();               // works because of the provider above
  return <button onClick={() => rf.fitView()}>Fit</button>;
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <ReactFlow /* ... */ />
      <Toolbar />
    </ReactFlowProvider>
  );
}
```

`useReactFlow` gives you the imperative instance — `getNodes()`, `setNodes()`, `fitView()`,
`screenToFlowPosition()` (essential for drag-and-drop from a palette), `zoomIn()`. It deliberately
**does not re-render** when the flow changes, so reading `getNodes()` in render is a stale-data bug
— call it inside an event handler or effect. When you want a value that *does* drive re-renders,
use the subscription hooks (`useNodes`, `useStore` with a selector) instead.

## Performance

Large graphs need help. The knobs, in order of impact:

- **`onlyRenderVisibleElements`** — cull off-screen nodes. The single biggest win past a few hundred
  nodes. Confirm the exact prop name via Context7; it's stable but worth checking on a major bump.
- **`memo()` on every custom node** — covered above.
- **Stable references** — never pass inline objects/arrays for `nodeTypes`, `edgeTypes`,
  `defaultEdgeOptions`, or `connectionLineStyle`. Each new identity invalidates memoization.
- **Narrow store selectors** — if state lives in Zustand, a broad subscription re-renders on every
  drag tick.
- **Lazy-load the editor route** — React Flow plus a node library is heavy; it belongs behind a
  `lazy()` boundary, not in the entry chunk (see `build-deploy.md`).

## Tailwind integration

React Flow's CSS and Tailwind v4 need explicit layering, or Tailwind's reset fights React Flow's
positioning styles. The docs-sanctioned pattern puts React Flow's stylesheet in the `base` layer:

```css
@import 'tailwindcss';

@layer base {
  @import '@xyflow/react/dist/style.css';
}
```

With that in place you can style custom nodes with your Tailwind tokens (`bg-surface`,
`border-border` from `ui-system.md`) and they'll cooperate with the pane's own styles. Verify this
layering recipe against current Context7 docs — CSS integration guidance is the kind of thing that
gets revised between minor versions.

## Footguns

**Nothing renders.** The parent has no height, or the CSS import is missing. Check both first.

**Every node re-mounts / warning about `nodeTypes`.** The object is being recreated each render.
Hoist it out or `useMemo` it.

**Drag is laggy.** Node state is mirrored through an external store on every change, or a custom
node isn't memoized, or a broad store selector re-renders the tree. Let React Flow own positions.

**`useReactFlow` returns stale nodes.** You read `getNodes()` during render. It's imperative — read
it in a handler.

**Hook throws "must be used inside a provider".** The component using the hook is a sibling of
`<ReactFlow>`, not a descendant of a `ReactFlowProvider`. Wrap the subtree.

**Drop-from-palette lands in the wrong spot.** You used raw client coordinates. Convert with
`screenToFlowPosition()` — it accounts for pan and zoom.

**Edges won't connect to the right port.** Multiple handles on a side without unique `id`s.
