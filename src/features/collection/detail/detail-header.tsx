import type { RequestDetail } from '@/bindings';
import { cn } from '@/lib/utils';
import { methodClass } from '@/features/theme/method';
import { breadcrumbSegments } from './detail-model';
import { VariableText } from './variable-token';
import type { VariableIndex } from './variables';

export interface DetailHeaderProps {
  detail: RequestDetail;
  variables: VariableIndex;
}

/**
 * FR-023 — the sticky request header of ux-design.md §S2.
 *
 * Sticky is not decoration: the panel below it scrolls through bodies and scripts that are
 * hundreds of lines long, and losing sight of *which request* you are reading is the failure
 * mode that costs the most. Every string here comes out of a stranger's collection file and is
 * rendered as a React text child — never `dangerouslySetInnerHTML` (NFR-010 / TC-U-072).
 */
export function DetailHeader({ detail, variables }: DetailHeaderProps) {
  const crumbs = breadcrumbSegments(detail.folderPath);

  return (
    <header
      data-testid="detail-header"
      className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-5 py-3 backdrop-blur"
    >
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" data-testid="detail-breadcrumb">
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

      <h2 data-testid="detail-name" className="mt-1 text-base font-semibold break-words">
        {detail.name}
      </h2>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          data-testid="detail-method"
          data-method={detail.method.toUpperCase()}
          // Colour is never the only carrier — the verb text is always present (NFR-011).
          className={cn(
            'shrink-0 rounded-sm border px-2 py-0.5 font-mono text-xs font-bold',
            methodClass(detail.method)
          )}
        >
          {detail.method.toUpperCase()}
        </span>
        <p data-testid="detail-url" className="min-w-0 font-mono text-sm break-all">
          <VariableText text={detail.url.raw} variables={variables} />
        </p>
      </div>

      {detail.description !== '' && (
        <p
          data-testid="detail-description"
          className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground"
        >
          {detail.description}
        </p>
      )}
    </header>
  );
}
