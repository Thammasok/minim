---
name: react-flow
description: Use when building node-based editors, diagrams, or flow-chart UIs with React Flow (`@xyflow/react`) — custom nodes/edges, controlled state via useNodesState/useEdgesState, connection handles, or canvas addons (MiniMap, Controls, Background). This repo installs it under `web/` (Vite/React/TypeScript SPA) — see CLAUDE.md's react-vite-developer trigger list.
---

# React Flow

## Purpose
React Flow (npm package `@xyflow/react`, formerly the unscoped `reactflow` package — always install/import the scoped name) is a React library for building interactive node-based UIs: diagrams, flow charts, pipeline/graph editors. It owns rendering, panning/zooming, and drag interactions; you own the node/edge *data* and pass it in as controlled state.

## When to Apply
- Adding a `<ReactFlow />` canvas anywhere in `web/src/features/**`.
- Defining a custom node or edge component (anything beyond the default box-with-label node).
- Wiring node/edge state so drags, connections, and deletions stay in sync with app state.
- Adding canvas chrome: minimap, zoom/fit controls, background grid/dots.

## Setup
```tsx
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
```
The CSS import is required — without it the canvas renders unstyled (no handles, no grid, broken drag affordances). Import it once, near the root of whichever feature owns the canvas.

A `<ReactFlow>` instance rendered outside its own subtree doesn't need `ReactFlowProvider`, but any *sibling* component that calls hooks like `useReactFlow()` (to imperatively pan/zoom/fit from outside the canvas) does — wrap both under one `<ReactFlowProvider>`:
```tsx
import { ReactFlowProvider, ReactFlow } from '@xyflow/react'

export default function FlowFeature() {
  return (
    <ReactFlowProvider>
      <ReactFlow nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  )
}
```

## Controlled State: useNodesState / useEdgesState
React Flow doesn't own node/edge arrays — you do, via these two hooks (thin wrappers that apply React Flow's internal change events, e.g. drag deltas, back onto your array):
```tsx
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

const onConnect = useCallback(
  (params) => setEdges((eds) => addEdge(params, eds)),
  [setEdges],
)

return (
  <ReactFlow
    nodes={nodes}
    edges={edges}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    onConnect={onConnect}
  >
    <MiniMap />
    <Controls />
    <Background />
  </ReactFlow>
)
```
- `onNodesChange`/`onEdgesChange` must be wired even for a "read-only-looking" canvas — omitting them silently breaks drag/select/remove interactions rather than erroring.
- `onConnect` + `addEdge(params, eds)` is the standard way to turn a completed drag-to-connect gesture into a new edge; `addEdge` just appends with a generated id, no magic beyond that.

## Custom Nodes
Register via a `nodeTypes` map keyed by the node's `type` string; each custom node receives `NodeProps<YourNodeType>` and must render its own `Handle`s to be connectable:
```tsx
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

type CounterNodeData = { count: number }
export type CounterNode = Node<CounterNodeData, 'counter'>

function CounterNodeComponent({ data }: NodeProps<CounterNode>) {
  return (
    <div>
      <Handle type="target" position={Position.Top} />
      <span>Count: {data.count}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { counter: CounterNodeComponent }
const nodes = [{ id: '1', type: 'counter', position: { x: 0, y: 0 }, data: { count: 0 } }]

<ReactFlow nodes={nodes} nodeTypes={nodeTypes} /* ... */ />
```
- `Node<DataType, 'typeString'>` is the generic pattern for typing a custom node end-to-end — reuse it (not a bare `Node`) so `NodeProps<YourNode>` narrows `data` correctly instead of falling back to `any`.
- A node needs at least one `Handle` (`type="target"` and/or `type="source"`) to participate in connections; a node with neither renders but can never be an edge endpoint.
- Multiple handles of the same `type` on one node need distinct `id` props so `onConnect`'s `params.sourceHandle`/`targetHandle` can disambiguate which one was used.
- Define `nodeTypes` (and `edgeTypes`) *outside* the component or memoize with `useMemo` — passing a fresh object literal every render is a documented React Flow perf footgun (it forces internal remounts).

## Custom Edges
```tsx
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

function MyEdgeComponent({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return <BaseEdge path={path} style={{ stroke: selected ? '#FF6B6B' : '#222' }} />
}
```
- Always render through `BaseEdge` rather than a raw `<path>` — it wires up the invisible wider hit-area path React Flow needs for click/select on thin lines.
- Use `getBezierPath`/`getStraightPath`/`getSmoothStepPath` (pick the one matching the edge's visual style) rather than hand-computing SVG path data.
- A labeled edge composes `EdgeText` (or arbitrary JSX inside an `EdgeLabelRenderer` for non-SVG content) positioned at the `labelX`/`labelY` the path helper returns.

## Canvas Addons
- `<MiniMap />` — viewport overview; `nodeColor`, `pannable`/`zoomable` are the common overrides.
- `<Controls />` — zoom in/out/fit-view buttons.
- `<Background />` — grid/dots backdrop; needs no props for the default look.
All three are optional children of `<ReactFlow>`, not separate top-level mounts.

## Checklist
- [ ] `@xyflow/react/dist/style.css` imported once — canvas isn't silently unstyled
- [ ] `onNodesChange`/`onEdgesChange` wired even when the canvas looks read-only
- [ ] Custom node/edge types typed via `Node<DataType, 'typeString'>` / `NodeProps<YourNode>`, not bare `Node`/`NodeProps`
- [ ] `nodeTypes`/`edgeTypes` objects defined outside the component or memoized, not recreated per render
- [ ] Custom nodes render at least one `Handle`; multiple same-type handles have distinct `id`s
- [ ] Custom edges render through `BaseEdge` (not a raw `<path>`) so click hit-area still works
- [ ] `ReactFlowProvider` added only when something outside `<ReactFlow>` needs `useReactFlow()`/imperative canvas control

## Reference
Fetched via context7 from `/xyflow/xyflow` (github.com/xyflow/xyflow). This repo pins `@xyflow/react` at `^12.11.x` (installed under `web/`) — for anything beyond this summary (viewport/zoom APIs, layouting integrations, sub-flows, drag-and-drop from a palette), query context7 again rather than relying on training data.
