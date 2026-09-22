import type { ReactElement } from 'react';
import { Info } from 'lucide-react';
import type { ScriptView } from '@/bindings';
import { CodeBlock } from './code-block';
import { EmptySection } from './empty-section';

/**
 * ux-design.md §S2b — pre-request and test scripts, read-only (FR-033, NFR-009).
 *
 * The notice is not decoration. A user reading a collection someone else sent them has no way of
 * knowing, from the pane alone, whether the `pm.sendRequest(...)` on screen already ran. Saying
 * so in the UI is the only place that question gets answered, so the notice is rendered
 * unconditionally — including when there are no scripts, where it also explains what the tab
 * would have done.
 *
 * The guarantee behind the notice is structural rather than promised: the source travels from
 * the DTO to `CodeBlock` to a React text node. It is never passed to `eval`, `new Function`, a
 * `<script>` tag, a `srcdoc`, an event-handler attribute or `dangerouslySetInnerHTML` — the
 * whole panel has no path that could evaluate it (TC-U-078).
 */

export interface ScriptsPanelProps {
  events: readonly ScriptView[];
}

export const SCRIPT_NOTICE = 'Scripts are displayed only. minim never runs them.';

/** FR-033 — labelled by event type, with anything non-standard passed through verbatim. */
function eventLabel(listen: string): string {
  switch (listen) {
    case 'prerequest':
      return 'Pre-request';
    case 'test':
      return 'Test';
    default:
      return listen;
  }
}

function ScriptSection({ event, index }: { event: ScriptView; index: number }): ReactElement {
  const label = eventLabel(event.listen);
  const disabled = event.disabled === true;

  return (
    <details
      open
      data-testid="script-event"
      data-listen={event.listen}
      data-disabled={disabled ? 'true' : undefined}
      className="rounded-md border"
    >
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span data-testid="script-label">{label}</span>
        {disabled && (
          <span
            data-testid="script-disabled-marker"
            // Marked, never hidden — a switched-off script reads very differently from
            // no script at all, the same judgement `KeyValueTable` makes for a row.
            className="ml-2 rounded-sm border px-1 text-[10px] text-muted-foreground"
          >
            disabled
          </span>
        )}
      </summary>
      <div className="px-3 pt-1 pb-3">
        {event.source === '' ? (
          <EmptySection what={`${label} script`} />
        ) : (
          <CodeBlock
            code={event.source}
            language="javascript"
            label={`${label} script`}
            testId={`script-code-${index}`}
          />
        )}
      </div>
    </details>
  );
}

export function ScriptsPanel({ events }: ScriptsPanelProps): ReactElement {
  return (
    <div data-testid="scripts-panel" className="space-y-3">
      {events.length === 0 ? (
        <EmptySection what="Scripts" />
      ) : (
        events.map((event, index) => (
          // Two `test` blocks on one request are legal, so position is part of the identity.
          <ScriptSection key={`${event.listen}:${index}`} event={event} index={index} />
        ))
      )}

      <p
        data-testid="scripts-notice"
        className="flex items-start gap-1.5 text-xs text-muted-foreground"
      >
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{SCRIPT_NOTICE}</span>
      </p>
    </div>
  );
}
