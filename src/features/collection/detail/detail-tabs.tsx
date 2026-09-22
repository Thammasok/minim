import { useMemo, useState } from 'react';
import { Tabs } from 'radix-ui';
import type { RequestDetail } from '@/bindings';
import { cn } from '@/lib/utils';
import { AuthPanel } from './auth-panel';
import { BodyPanel } from './body-panel';
import { buildTabs, firstNonEmptyTabId, type TabDescriptor, type TabId } from './detail-model';
import { HeadersTable } from './headers-table';
import { ParamsTable } from './params-table';
import { ExamplesPanel } from './examples-panel';
import { ScriptsPanel } from './scripts-panel';
import type { VariableIndex } from './variables';

export interface DetailTabsProps {
  detail: RequestDetail;
  variables: VariableIndex;
}

/**
 * ux-design.md §S2 — the tab shell and its badge row.
 *
 * The badges are the point of the component: before them, finding which of six sections held
 * anything meant clicking all six (design review heuristic #6, scored 4). They are therefore
 * computed for *every* tab, including the one whose renderer still lands in T-018 — the
 * fingerprint is worthless with holes in it.
 *
 * The pane opens on the first non-empty tab. `DetailTabs` is mounted with the node id as its
 * key, so selecting a different request re-runs that decision instead of stranding the user on
 * a tab that is empty for the new request.
 */
export function DetailTabs({ detail, variables }: DetailTabsProps) {
  const tabs = useMemo(() => buildTabs(detail), [detail]);
  const [value, setValue] = useState<TabId>(() => firstNonEmptyTabId(tabs));

  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => setValue(next as TabId)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs.List
        data-testid="detail-tablist"
        aria-label="Request sections"
        className="flex h-9 shrink-0 items-stretch gap-1 border-b px-5"
      >
        {tabs.map((tab) => (
          <TabTrigger key={tab.id} tab={tab} />
        ))}
      </Tabs.List>

      {/* Only this container scrolls; the header above stays put (ux §S2, TC-COMP-012). */}
      <div data-testid="detail-panel-scroll" className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <Tabs.Content
          value="params"
          data-testid="panel-params"
          className="focus-visible:outline-none"
        >
          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Query parameters
            </h3>
            <ParamsTable
              params={detail.url.query}
              caption="Query parameters"
              testId="query-params-table"
              variables={variables}
            />
          </section>
          <section className="mt-6">
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Path variables
            </h3>
            <ParamsTable
              params={detail.url.pathVariables}
              caption="Path variables"
              testId="path-variables-table"
              variables={variables}
            />
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="headers"
          data-testid="panel-headers"
          className="focus-visible:outline-none"
        >
          <HeadersTable headers={detail.headers} variables={variables} />
        </Tabs.Content>

        <Tabs.Content value="body" data-testid="panel-body" className="focus-visible:outline-none">
          <BodyPanel body={detail.body} variables={variables} />
        </Tabs.Content>

        <Tabs.Content value="auth" data-testid="panel-auth" className="focus-visible:outline-none">
          <AuthPanel auth={detail.auth} nodeId={detail.id} variables={variables} />
        </Tabs.Content>

        <Tabs.Content
          value="scripts"
          data-testid="panel-scripts"
          className="focus-visible:outline-none"
        >
          <ScriptsPanel events={detail.events} />
        </Tabs.Content>

        <Tabs.Content
          value="examples"
          data-testid="panel-examples"
          className="focus-visible:outline-none"
        >
          <ExamplesPanel nodeId={detail.id} examples={detail.examples} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function TabTrigger({ tab }: { tab: TabDescriptor }) {
  return (
    <Tabs.Trigger
      value={tab.id}
      data-testid={`tab-${tab.id}`}
      data-empty={tab.isEmpty ? 'true' : undefined}
      className={cn(
        'flex items-center gap-1.5 border-b-2 border-transparent px-2 text-xs',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'data-[state=active]:border-foreground data-[state=active]:font-medium',
        tab.isEmpty && 'text-muted-foreground'
      )}
    >
      {tab.label}
      <span
        data-testid={`tab-badge-${tab.id}`}
        // The glyph badges (⊥, —) are not words; the label is what a screen reader hears.
        aria-label={tab.badgeLabel ?? undefined}
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-secondary px-1 font-mono text-[10px] text-secondary-foreground"
      >
        {tab.badge}
      </span>
    </Tabs.Trigger>
  );
}
