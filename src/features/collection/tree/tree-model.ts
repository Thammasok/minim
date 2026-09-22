import type { TreeNode } from '@/bindings';

/**
 * The flattened visible-node list that `@tanstack/react-virtual` indexes into.
 *
 * Virtualization is only correct over a flat list, so depth never becomes nested DOM —
 * it becomes `paddingLeft` on the row (ux §S2, "Indentation"). The positional ARIA
 * attributes are computed here, over the **full** list, because the DOM only ever holds
 * the visible window and assistive tech cannot infer position from it (TC-U-065).
 */
export type FlatNode = {
  id: string;
  node: TreeNode;
  /** 0 for a top-level node; `aria-level` is this + 1 */
  depth: number;
  parentId: string | null;
  /** 1-based index among the visible siblings of the whole list, not the window */
  posInSet: number;
  /** count of visible siblings in the whole list, not the window */
  setSize: number;
  isFolder: boolean;
  /** folders only, and only when they actually have visible children */
  hasChildren: boolean;
  isExpanded: boolean;
  /** false only while a filter is active and this row is a retained ancestor */
  isMatch: boolean;
};

export type FlattenOptions = {
  expandedIds: ReadonlySet<string>;
  /** `null` = no filter; otherwise only these ids may appear */
  visibleIds: ReadonlySet<string> | null;
  /** `null` = no filter, so every row counts as a match and nothing is dimmed */
  matchIds: ReadonlySet<string> | null;
};

/** Depth-first walk in document order. Nothing is ever re-sorted (FR-018). */
export function flattenTree(nodes: readonly TreeNode[], options: FlattenOptions): FlatNode[] {
  const { expandedIds, visibleIds, matchIds } = options;
  const out: FlatNode[] = [];

  const visit = (siblings: readonly TreeNode[], depth: number, parentId: string | null): void => {
    const shown =
      visibleIds === null ? siblings : siblings.filter((node) => visibleIds.has(node.id));
    const setSize = shown.length;

    shown.forEach((node, index) => {
      const isFolder = node.kind === 'folder';
      const children =
        visibleIds === null ? node.children : node.children.filter((c) => visibleIds.has(c.id));
      const hasChildren = children.length > 0;
      const isExpanded = isFolder && expandedIds.has(node.id);

      out.push({
        id: node.id,
        node,
        depth,
        parentId,
        posInSet: index + 1,
        setSize,
        isFolder,
        hasChildren,
        isExpanded,
        isMatch: matchIds === null ? true : matchIds.has(node.id),
      });

      if (isExpanded && hasChildren) visit(node.children, depth + 1, node.id);
    });
  };

  visit(nodes, 0, null);
  return out;
}

/** Every folder id in the tree — the argument expand-all and the filter snapshot need. */
export function collectFolderIds(nodes: readonly TreeNode[]): string[] {
  const ids: string[] = [];
  const visit = (siblings: readonly TreeNode[]): void => {
    for (const node of siblings) {
      if (node.kind === 'folder') ids.push(node.id);
      visit(node.children);
    }
  };
  visit(nodes);
  return ids;
}

/** Request leaves in the whole tree — the denominator of "6 of 214". */
export function countRequests(nodes: readonly TreeNode[]): number {
  let total = 0;
  const visit = (siblings: readonly TreeNode[]): void => {
    for (const node of siblings) {
      if (node.kind === 'request') total += 1;
      visit(node.children);
    }
  };
  visit(nodes);
  return total;
}

/** `padding-left: calc(depth * 0.75rem + 0.5rem)` — padding, never nested DOM. */
export function indentRem(depth: number): string {
  return `${depth * 0.75 + 0.5}rem`;
}
