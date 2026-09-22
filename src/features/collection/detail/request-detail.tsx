import { useMemo } from 'react';
import type { NodeDetail, RequestDetail as RequestDetailDto } from '@/bindings';
import { CollectionLoading } from '@/features/errors';
import { errorMessage } from '@/lib/error-message';
import { useCollectionStore } from '@/features/collection/store';
import { asAppError, useNodeDetail } from '@/features/collection/queries';
import { DetailHeader } from './detail-header';
import { DetailTabs } from './detail-tabs';
import { FolderDetailView } from './folder-detail';
import { BehaviorSection } from './metadata-sections';
import { buildVariableIndex } from './variables';

export interface RequestDetailProps {
  /**
   * Overrides the store selection. Omit it in the app — the pane follows `selectedNodeId` —
   * and pass it in tests, or anywhere a second pane needs to show a different node.
   */
  nodeId?: string | null;
}

/**
 * S2 — the detail pane, and the integration surface for this feature folder.
 *
 * Mount it inside the detail `ResizablePanel` in `app.tsx`. It needs a `QueryClientProvider`
 * above it (see `queries.ts`); nothing else.
 *
 * Detail is fetched per selected node rather than shipped with the overview (ADR-005) and
 * cached forever by `NodeId`, so re-selecting a request is a cache read and the 100 ms budget
 * of NFR-002 is spent on rendering rather than on IPC.
 */
export function RequestDetail({ nodeId }: RequestDetailProps = {}) {
  const selectedNodeId = useCollectionStore((state) => state.selectedNodeId);
  const activeId = nodeId === undefined ? selectedNodeId : nodeId;
  const query = useNodeDetail(activeId);

  if (activeId === null || activeId === '') {
    return (
      <Centered testId="detail-nothing-selected">
        Select a request in the tree to see its detail.
      </Centered>
    );
  }

  // `get_node_detail` is an arena lookup, so this is usually one frame — but a frame with a
  // blank pane still reads as a bug, and the skeleton is the app's existing answer for that.
  if (query.isPending) return <CollectionLoading />;
  if (query.isError) return <DetailError error={query.error} />;

  return <NodeDetailView detail={query.data} />;
}

function NodeDetailView({ detail }: { detail: NodeDetail }) {
  if (detail.kind === 'folder') {
    // S3 — the badge row above a request has no meaning for a folder, so this is a whole
    // separate surface rather than a variant of the request tabs.
    return <FolderDetailView detail={detail} />;
  }
  return <RequestDetailView detail={detail} />;
}

export interface RequestDetailViewProps {
  detail: RequestDetailDto;
}

/**
 * The presentational half — header over tab shell, no data fetching.
 *
 * Split out so the render cost NFR-002 budgets can be measured on its own, and so T-017/T-018
 * can mount a single request against a fixture DTO without a QueryClient.
 */
export function RequestDetailView({ detail }: RequestDetailViewProps) {
  const variables = useMemo(() => buildVariableIndex(detail.variableRefs), [detail.variableRefs]);

  return (
    <div data-testid="request-detail" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DetailHeader detail={detail} variables={variables} />
      {/* FR-034 — `protocolProfileBehavior` has no tab of its own (see `BehaviorSection`);
          it renders as a strip under the header and disappears when the file declares none. */}
      <BehaviorSection behavior={detail.behavior} extra={detail.extra} />
      {/* Keyed by node: a new request re-runs the "first non-empty tab" decision. */}
      <DetailTabs key={detail.id} detail={detail} variables={variables} />
    </div>
  );
}

function Centered({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * A failed `get_node_detail`, rendered inline rather than as a modal: the collection is open
 * and the tree still works, so blocking the whole window would overstate the failure. The copy
 * is the shared `errorMessage` map — T-019 owns those sentences, this only lays them out.
 */
function DetailError({ error }: { error: unknown }) {
  const appError = asAppError(error);

  if (appError === null) {
    // The transport itself failed rather than the command — no AppError variant describes it.
    return (
      <div
        data-testid="detail-error"
        role="alert"
        className="flex min-h-0 flex-1 items-center justify-center p-6"
      >
        <p className="text-center text-sm text-muted-foreground">
          minim couldn’t load this request.
        </p>
      </div>
    );
  }

  const copy = errorMessage(appError);

  return (
    <div
      data-testid="detail-error"
      data-error-kind={appError.kind}
      role="alert"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.summary}</p>
      {copy.detail !== null && <p className="text-xs text-muted-foreground">{copy.detail}</p>}
      {copy.fix !== null && <p className="text-xs">{copy.fix}</p>}
    </div>
  );
}
