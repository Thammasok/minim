import type { CSSProperties } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { methodClass } from '@/features/theme/method';
import { highlight } from './highlight';
import { indentRem, type FlatNode } from './tree-model';

export type TreeRowProps = {
  row: FlatNode;
  isSelected: boolean;
  isFocused: boolean;
  /** normalized needle; empty when no filter is active */
  needle: string;
  filterActive: boolean;
  style: CSSProperties;
  onActivate: (row: FlatNode) => void;
  registerRef: (id: string, element: HTMLDivElement | null) => void;
};

export function TreeRow({
  row,
  isSelected,
  isFocused,
  needle,
  filterActive,
  style,
  onActivate,
  registerRef,
}: TreeRowProps) {
  const { node } = row;
  const isContext = filterActive && !row.isMatch;
  const FolderIcon = row.isExpanded ? FolderOpen : Folder;

  return (
    <div
      ref={(element) => registerRef(row.id, element)}
      role="treeitem"
      data-node-id={row.id}
      data-testid="tree-row"
      data-depth={row.depth}
      data-kind={node.kind}
      // Dimming alone would be a colour-only signal; the flags below are what the
      // filter tests (and any future audit) read to tell a hit from its context.
      data-match={filterActive ? String(row.isMatch) : undefined}
      data-context={isContext ? 'true' : undefined}
      aria-level={row.depth + 1}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-selected={isSelected}
      aria-expanded={row.isFolder ? row.isExpanded : undefined}
      // Roving tabindex: exactly one row is tabbable, so the tree is one tab stop.
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        'flex h-7 cursor-default items-center gap-1.5 rounded-sm pr-2 text-sm select-none',
        'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        isSelected && 'bg-accent font-medium',
        isContext && 'opacity-60'
      )}
      style={{ ...style, paddingLeft: indentRem(row.depth) }}
      onClick={() => onActivate(row)}
    >
      {row.isFolder ? (
        <ChevronRight
          aria-hidden="true"
          data-open={row.isExpanded ? 'true' : undefined}
          data-testid="tree-caret"
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
            row.isExpanded && 'rotate-90',
            !row.hasChildren && 'invisible'
          )}
        />
      ) : (
        <span aria-hidden="true" className="size-3.5 shrink-0" />
      )}

      {row.isFolder ? (
        <FolderIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <span
          data-testid="method-chip"
          className={cn(
            'w-12 shrink-0 text-center font-mono text-[10px] font-semibold',
            // Colour is never the only signal — the verb text is always rendered.
            methodClass(node.method ?? '')
          )}
        >
          {(node.method ?? '').toUpperCase()}
        </span>
      )}

      <span className="truncate">{row.isMatch ? highlight(node.name, needle) : node.name}</span>
    </div>
  );
}
