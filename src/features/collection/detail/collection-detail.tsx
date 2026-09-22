import { useMemo, useState } from 'react';
import { Tabs } from 'radix-ui';
import type { CollectionOverview } from '@/bindings';
import { cn } from '@/lib/utils';
import { authBadge, NONE_BADGE } from './detail-model';
import { AuthSummary, DetailSection, ScriptsList, VariablesTable } from './metadata-sections';
import { useVariableUsage } from './variable-usage';

/**
 * ux-design.md §S4 — the collection itself.
 *
 * Its data source is `CollectionOverview`, not `get_node_detail`: the root id deliberately
 * answers `UnknownNode` (TC-CMD-019), because everything this screen shows already arrived with
 * the one `open_collection` call. So this component takes the overview as a prop and fetches
 * nothing of its own — except the USED counts, and only while their tab is open.
 */

type CollectionTabId = 'variables' | 'auth' | 'scripts' | 'info';

const DEFAULT_TAB: CollectionTabId = 'variables';

const SECTION_TITLE_CLASS =
  'mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase';

export interface CollectionDetailProps {
  overview: CollectionOverview;
}

export function CollectionDetail({ overview }: CollectionDetailProps) {
  const [tab, setTab] = useState<CollectionTabId>(DEFAULT_TAB);

  // The fan-out behind USED runs only while its column is on screen — see `variable-usage.ts`
  // for why the count cannot come out of the overview today.
  const usage = useVariableUsage(overview.tree, { enabled: tab === 'variables' });

  const tabs = useMemo(
    () => [
      { id: 'variables' as const, label: 'Variables', badge: String(overview.variables.length) },
      {
        id: 'auth' as const,
        label: 'Auth',
        badge: overview.auth === null ? NONE_BADGE : authBadge(overview.auth).badge,
      },
      { id: 'scripts' as const, label: 'Scripts', badge: String(overview.events.length) },
      { id: 'info' as const, label: 'Info', badge: null },
    ],
    [overview.auth, overview.events.length, overview.variables.length]
  );

  const meta = [
    overview.version === null || overview.version === '' ? null : `version ${overview.version}`,
    `${overview.requestCount} requests`,
    `${overview.folderCount} folders`,
  ].filter((part) => part !== null);

  return (
    <div data-testid="collection-detail" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        data-testid="collection-header"
        className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-5 py-3 backdrop-blur"
      >
        <p className="text-xs text-muted-foreground">Collection</p>
        <h2 data-testid="collection-name" className="mt-1 text-base font-semibold break-words">
          {overview.name}
        </h2>
        <p
          data-testid="collection-schema"
          className="mt-1 font-mono text-xs break-all text-muted-foreground"
        >
          {overview.schema}
        </p>
        <p data-testid="collection-meta" className="mt-1 text-xs text-muted-foreground">
          {meta.join(' · ')}
        </p>
        {overview.description !== '' && (
          <p
            data-testid="collection-description"
            className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground"
          >
            {overview.description}
          </p>
        )}
      </header>

      <Tabs.Root
        value={tab}
        onValueChange={(next) => setTab(next as CollectionTabId)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List
          data-testid="collection-tablist"
          aria-label="Collection sections"
          className="flex h-9 shrink-0 items-stretch gap-1 border-b px-5"
        >
          {tabs.map((entry) => (
            <Tabs.Trigger
              key={entry.id}
              value={entry.id}
              data-testid={`collection-tab-${entry.id}`}
              className={cn(
                'flex items-center gap-1.5 border-b-2 border-transparent px-2 text-xs',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                'data-[state=active]:border-foreground data-[state=active]:font-medium'
              )}
            >
              {entry.label}
              {entry.badge !== null && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-secondary px-1 font-mono text-[10px] text-secondary-foreground">
                  {entry.badge}
                </span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <Tabs.Content
            value="variables"
            data-testid="panel-collection-variables"
            className="focus-visible:outline-none"
          >
            <VariablesTable
              variables={overview.variables}
              // `null` while the fan-out is still answering: a partial count printed as final
              // would be a lie, and "…" is the honest intermediate state.
              usage={usage.complete ? usage.counts : null}
              caption="Collection variables"
              testId="collection-variables-table"
            />
          </Tabs.Content>

          <Tabs.Content
            value="auth"
            data-testid="panel-collection-auth"
            className="focus-visible:outline-none"
          >
            <AuthSummary auth={overview.auth} testId="collection-auth" />
          </Tabs.Content>

          <Tabs.Content
            value="scripts"
            data-testid="panel-collection-scripts"
            className="focus-visible:outline-none"
          >
            <ScriptsList events={overview.events} testId="collection-scripts" />
          </Tabs.Content>

          <Tabs.Content
            value="info"
            data-testid="panel-collection-info"
            className="focus-visible:outline-none"
          >
            <DetailSection title="Info" testId="collection-info">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <InfoRow label="Name" value={overview.name} />
                <InfoRow label="Description" value={overview.description} />
                <InfoRow label="Schema" value={overview.schema} mono />
                <InfoRow label="Version" value={overview.version} />
                <InfoRow label="Source" value={overview.sourcePath} mono />
                <InfoRow label="Size" value={`${overview.fileSizeBytes} bytes`} mono />
                <InfoRow label="Requests" value={String(overview.requestCount)} mono />
                <InfoRow label="Folders" value={String(overview.folderCount)} mono />
              </dl>
            </DetailSection>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <>
      <dt className={cn(SECTION_TITLE_CLASS, 'mb-0')}>{label}</dt>
      <dd
        data-testid={`collection-info-${label.toLowerCase()}`}
        className={cn('break-all', mono && 'font-mono text-xs')}
      >
        {value === null || value === '' ? <span className="text-muted-foreground">—</span> : value}
      </dd>
    </>
  );
}
