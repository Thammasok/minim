import type { FolderDetail } from '@/bindings';
import { breadcrumbSegments } from './detail-model';
import { AuthSummary, DetailSection, ScriptsList, VariablesTable } from './metadata-sections';

export interface FolderDetailViewProps {
  detail: FolderDetail;
}

/**
 * ux-design.md §S3 — a folder's own scripts, auth and variables (FR-039).
 *
 * Deliberately stacked sections rather than the request tab shell: a folder has three things to
 * say and all three fit on one screen, so hiding two of them behind tabs would cost a click to
 * learn nothing. It also keeps the promise of TC-COMP-024 structurally — there is no Params,
 * Body or Examples tab here to show for something that has none of them.
 *
 * Auth is the folder's own `AuthView`, so an inherited badge here names the collection it came
 * from rather than this folder.
 */
export function FolderDetailView({ detail }: FolderDetailViewProps) {
  const crumbs = breadcrumbSegments(detail.folderPath);

  const meta = [
    `${detail.descendantRequestCount} requests`,
    `${detail.childCount} direct children`,
  ];

  return (
    <div data-testid="folder-detail" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        data-testid="folder-header"
        className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-5 py-3 backdrop-blur"
      >
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" data-testid="folder-breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {crumbs.map((crumb, index) => (
                <li key={index} className="flex items-center gap-1">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      ›
                    </span>
                  )}
                  {crumb.kind === 'ellipsis' ? (
                    <span title={`${crumb.hidden} more folders`}>…</span>
                  ) : (
                    <span className="max-w-48 truncate">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <p className="mt-1 text-xs text-muted-foreground">Folder</p>
        <h2 data-testid="folder-name" className="mt-1 text-base font-semibold break-words">
          {detail.name}
        </h2>
        <p data-testid="folder-meta" className="mt-1 text-xs text-muted-foreground">
          {meta.join(' · ')}
        </p>
        {detail.description !== '' && (
          <p
            data-testid="folder-description"
            className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground"
          >
            {detail.description}
          </p>
        )}
      </header>

      <div data-testid="folder-panel-scroll" className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          <DetailSection title="Folder variables" testId="folder-variables">
            <VariablesTable
              variables={detail.variable}
              caption="Folder variables"
              testId="folder-variables-table"
            />
          </DetailSection>

          <DetailSection title="Folder auth" testId="folder-auth-section">
            <AuthSummary auth={detail.auth} testId="folder-auth" />
          </DetailSection>

          <DetailSection title="Folder scripts" testId="folder-scripts-section">
            <ScriptsList events={detail.events} testId="folder-scripts" />
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
