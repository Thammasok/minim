import { useCallback, useMemo, useState } from 'react';
import type { Layout } from 'react-resizable-panels';
import { useQueryClient } from '@tanstack/react-query';
import { FileJson2, Monitor, Moon, RotateCw, Sun, X } from 'lucide-react';
import { commands } from '@/bindings';
import type { CollectionOverview, TreeNode } from '@/bindings';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { CollectionDetail, RequestDetail } from '@/features/collection/detail';
import { collectionKeys } from '@/features/collection/queries';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionTree } from '@/features/collection/tree';
import { EmptyCollection, WarningsBanner, WarningsStatus } from '@/features/errors';
import { EmptyState, useOpenCollection, useTauriFileDrop } from '@/features/session';
import { useTheme } from '@/features/theme/theme-context';
import type { ThemePref } from '@/features/theme/theme';

const SIDEBAR_SIZE_KEY = 'minim:sidebar-size';
const SIDEBAR_DEFAULT = 24;
const SIDEBAR_MIN = 16;
const SIDEBAR_MAX = 40;

function readSidebarSize(): number {
  const stored = Number(window.localStorage.getItem(SIDEBAR_SIZE_KEY));
  if (!Number.isFinite(stored) || stored < SIDEBAR_MIN || stored > SIDEBAR_MAX) {
    return SIDEBAR_DEFAULT;
  }
  return stored;
}

function persistSidebarLayout(layout: Layout) {
  const size = layout['tree'];
  if (typeof size === 'number' && Number.isFinite(size)) {
    window.localStorage.setItem(SIDEBAR_SIZE_KEY, String(Math.round(size)));
  }
}

function nextPref(pref: ThemePref): ThemePref {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
}

/**
 * `NodeId` → the folder path the user sees in the tree, so a warning names a place rather than
 * an opaque id. Built once per collection: warnings are few, but the lookup is per-row.
 */
function buildPathIndex(tree: readonly TreeNode[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      index.set(node.id, [...node.folderPath, node.name].join(' / '));
      walk(node.children);
    }
  };
  walk(tree);
  return index;
}

function ThemeToggle() {
  const { prefs, setTheme } = useTheme();
  const Icon = prefs === 'system' ? Monitor : prefs === 'dark' ? Moon : Sun;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${prefs}, switch to ${nextPref(prefs)}`}
      title={`Theme: ${prefs}`}
      onClick={() => setTheme(nextPref(prefs))}
    >
      <Icon />
    </Button>
  );
}

export default function App() {
  const [sidebarSize] = useState(readSidebarSize);
  const [overview, setOverview] = useState<CollectionOverview | null>(null);
  const queryClient = useQueryClient();
  const resetSelection = useCollectionStore((s) => s.reset);
  const selectedNodeId = useCollectionStore((s) => s.selectedNodeId);
  const select = useCollectionStore((s) => s.select);

  // Every cache key nests under `collectionKeys.all`, so one removal drops the whole arena.
  const dropCaches = useCallback(() => {
    queryClient.removeQueries({ queryKey: collectionKeys.all });
    resetSelection();
  }, [queryClient, resetSelection]);

  const onOpened = useCallback(
    (next: CollectionOverview) => {
      dropCaches();
      setOverview(next);
    },
    [dropCaches]
  );

  // Window-wide drop, live whether or not a collection is already open (ux §S1: the whole
  // window is the target, not a bordered zone).
  const { openPath } = useOpenCollection(onOpened);
  const { dragging, rejection, clearRejection } = useTauriFileDrop(openPath);

  const onClose = useCallback(() => {
    void commands.closeCollection();
    dropCaches();
    setOverview(null);
  }, [dropCaches]);

  const onReload = useCallback(async () => {
    const result = await commands.reloadCollection();
    if (result.status === 'ok') {
      dropCaches();
      setOverview(result.data);
    }
  }, [dropCaches]);

  const pathIndex = useMemo(
    () => (overview === null ? null : buildPathIndex(overview.tree)),
    [overview]
  );
  const resolvePath = useCallback((nodeId: string) => pathIndex?.get(nodeId) ?? null, [pathIndex]);

  return (
    <div data-testid="app-root" className="flex h-screen flex-col bg-background text-foreground">
      <header
        data-testid="app-topbar"
        className="flex h-12 shrink-0 items-center gap-3 border-b px-3"
      >
        <FileJson2 className="size-4 shrink-0 text-muted-foreground" />
        {overview === null ? (
          <span className="truncate text-sm font-medium">No collection open</span>
        ) : (
          <button
            type="button"
            onClick={() => select(null)}
            aria-current={selectedNodeId === null ? 'true' : undefined}
            title="Show collection details"
            className="truncate rounded-sm text-sm font-medium hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {overview.name}
          </button>
        )}
        {overview !== null && (
          <span
            className="hidden truncate font-mono text-xs text-muted-foreground md:block"
            title={overview.sourcePath}
          >
            {overview.sourcePath}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          disabled={overview === null}
          aria-label="Reload collection"
          onClick={() => void onReload()}
        >
          <RotateCw />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={overview === null}
          aria-label="Close collection"
          onClick={onClose}
        >
          <X />
        </Button>
        <ThemeToggle />
      </header>

      {rejection !== null && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-3 border-b border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <span className="flex-1">{rejection}</span>
          <Button variant="ghost" size="sm" onClick={clearRejection}>
            Dismiss
          </Button>
        </div>
      )}

      {overview !== null && (
        <WarningsBanner
          key={overview.sourcePath}
          warnings={overview.warnings}
          resolvePath={resolvePath}
        />
      )}

      {overview === null ? (
        <main className="min-h-0 flex-1 overflow-auto">
          <EmptyState onOpened={onOpened} />
        </main>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          onLayoutChanged={persistSidebarLayout}
        >
          <ResizablePanel
            id="tree"
            defaultSize={`${sidebarSize}`}
            minSize={`${SIDEBAR_MIN}`}
            maxSize={`${SIDEBAR_MAX}`}
            className="flex flex-col border-r"
          >
            <CollectionTree tree={overview.tree} collectionName={overview.name} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="detail" className="flex flex-col overflow-hidden">
            {overview.tree.length === 0 ? (
              <EmptyCollection collectionName={overview.name} />
            ) : selectedNodeId === null ? (
              <CollectionDetail overview={overview} />
            ) : (
              <RequestDetail />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 border-2 border-dashed border-primary bg-primary/5"
        />
      )}

      <footer
        data-testid="app-statusbar"
        className="flex h-6 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground"
      >
        {overview === null ? (
          <span>No collection open</span>
        ) : (
          <>
            <span className="font-mono">{overview.requestCount} requests</span>
            <span>{overview.folderCount} folders</span>
            <WarningsStatus warnings={overview.warnings} />
          </>
        )}
        <span className="ml-auto">v2.1</span>
      </footer>
    </div>
  );
}
