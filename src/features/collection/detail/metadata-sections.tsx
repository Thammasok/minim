import { useMemo } from 'react';
import type { AuthView, KeyValue, ScriptView, VariableView } from '@/bindings';
import { cn } from '@/lib/utils';
import { EmptySection } from './empty-section';
import { SCRIPT_NOTICE } from './scripts-panel';
import { VariableText } from './variable-token';
import { buildVariableIndex } from './variables';

/**
 * The sections the collection (§S4) and folder (§S3) views are built from.
 *
 * S2's request tabs are a different surface with a different owner (T-016/T-017), so these are
 * deliberately their own, simpler renderers: a collection has no reveal state to reset and no
 * body modes to switch on. Where the two surfaces would genuinely say the same thing — the
 * `(none)` of FR-036, the key/value typography — the shared pieces are reused rather than
 * re-styled.
 *
 * Every string rendered here comes out of a stranger's collection file and is passed as a React
 * text child; nothing in this file can produce markup (NFR-010).
 */

const HEAD_CLASS =
  'py-1 pr-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase';
const CELL_CLASS = 'py-1.5 pr-3 align-top';
const SECTION_TITLE_CLASS =
  'mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase';

/** A masked credential. FR-032's per-value reveal belongs to S2; S3/S4 only ever mask. */
const MASK = '••••••••';

/** `usage` counts that have not finished arriving yet — the column shows this, not a wrong 0. */
const COUNTING = '…';

export interface VariablesTableProps {
  variables: readonly VariableView[];
  /**
   * FR-038's USED column: how many requests reference each key.
   *
   * `undefined` renders no column at all (folder variables, where the count is not computed),
   * `null` means the count is still being collected.
   */
  usage?: ReadonlyMap<string, number> | null;
  /** Names the table for assistive tech — "Collection variables". */
  caption: string;
  testId: string;
}

/**
 * FR-038 — key, value, type and disabled state for a variable scope.
 *
 * A disabled variable is struck through and labelled rather than hidden, for the same reason a
 * disabled header is (TC-COMP-013): "declared but off" and "never declared" are different facts
 * about a collection and must not render identically.
 */
export function VariablesTable({ variables, usage, caption, testId }: VariablesTableProps) {
  // A variable's value may itself hold `{{refs}}`; every key in this scope is by definition
  // declared, so the chips resolve against the scope's own keys.
  const index = useMemo(
    () => buildVariableIndex(variables.map((variable) => ({ name: variable.key, defined: true }))),
    [variables]
  );

  if (variables.length === 0) return <EmptySection what={caption} />;

  const showUsage = usage !== undefined;

  return (
    <table data-testid={testId} className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b">
          <th scope="col" className={HEAD_CLASS}>
            Key
          </th>
          <th scope="col" className={HEAD_CLASS}>
            Value
          </th>
          <th scope="col" className={HEAD_CLASS}>
            Type
          </th>
          {showUsage && (
            <th
              scope="col"
              className={cn(HEAD_CLASS, 'text-right')}
              title="Requests referencing it"
            >
              Used
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {variables.map((variable, position) => {
          const disabled = variable.disabled === true;
          return (
            <tr
              // Duplicate keys are a load warning, not a crash — position keeps the rows distinct.
              key={`${variable.key}:${position}`}
              data-testid="variable-row"
              data-key={variable.key}
              data-disabled={disabled ? 'true' : undefined}
              className={cn(
                'border-b last:border-0 hover:bg-muted/40',
                disabled && 'text-muted-foreground'
              )}
            >
              <td
                className={cn(
                  CELL_CLASS,
                  'font-mono text-xs break-all',
                  disabled && 'line-through'
                )}
              >
                {variable.key === '' ? (
                  <span className="text-muted-foreground italic">(no key)</span>
                ) : (
                  variable.key
                )}
              </td>
              <td
                className={cn(
                  CELL_CLASS,
                  'font-mono text-xs break-all',
                  disabled && 'line-through'
                )}
              >
                {variable.value === null || variable.value === '' ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <VariableText text={variable.value} variables={index} />
                )}
              </td>
              <td className={cn(CELL_CLASS, 'text-xs')}>
                {variable.type === null || variable.type === '' ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  variable.type
                )}
                {disabled && (
                  <span
                    data-testid="disabled-marker"
                    // inline-block starts a new decoration root, so the row's strike-through
                    // does not run through the word that explains the strike-through.
                    className="ml-2 inline-block rounded-sm border px-1 text-[10px] no-underline"
                  >
                    disabled
                  </span>
                )}
              </td>
              {showUsage && (
                <td
                  data-testid="variable-used"
                  data-used={usage === null ? undefined : String(usage.get(variable.key) ?? 0)}
                  className={cn(CELL_CLASS, 'text-right font-mono text-xs')}
                >
                  {usage === null ? COUNTING : (usage.get(variable.key) ?? 0)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface AuthSummaryProps {
  auth: AuthView | null;
  testId: string;
}

/**
 * FR-030/FR-031 — the auth declared at this scope, with its source named.
 *
 * Unknown `authType`s pass through verbatim: a collection using an auth minim has never heard of
 * still shows what it declared rather than an empty panel.
 */
export function AuthSummary({ auth, testId }: AuthSummaryProps) {
  if (auth === null || auth.source.kind === 'none') return <EmptySection what="Auth" />;

  const inheritedFrom =
    auth.source.kind === 'collection'
      ? 'Inherited from collection'
      : auth.source.kind === 'folder'
        ? `Inherited from folder “${auth.source.name}”`
        : null;

  return (
    <section data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          data-testid="auth-type"
          className="rounded-sm border px-2 py-0.5 font-mono text-xs font-medium"
        >
          {auth.authType}
        </span>
        {inheritedFrom !== null && (
          <span
            data-testid="auth-inherited"
            className="rounded-sm bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
          >
            {inheritedFrom}
          </span>
        )}
      </div>

      {auth.attributes.length === 0 ? (
        <EmptySection what="Auth attributes" />
      ) : (
        <table data-testid={`${testId}-attributes`} className="w-full border-collapse text-sm">
          <caption className="sr-only">Auth attributes</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={HEAD_CLASS}>
                Key
              </th>
              <th scope="col" className={HEAD_CLASS}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {auth.attributes.map((attribute, position) => (
              <tr
                key={`${attribute.key}:${position}`}
                data-testid="auth-attr-row"
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className={cn(CELL_CLASS, 'font-mono text-xs break-all')}>{attribute.key}</td>
                <td className={cn(CELL_CLASS, 'font-mono text-xs break-all')}>
                  {attribute.sensitive ? (
                    <span data-testid="masked-value" aria-label="hidden credential">
                      {MASK}
                    </span>
                  ) : attribute.value === null || attribute.value === '' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    attribute.value
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** `prerequest` / `test` are the two the schema names; anything else shows as declared. */
function scriptLabel(listen: string): string {
  if (listen === 'prerequest') return 'Pre-request';
  if (listen === 'test') return 'Test';
  return listen === '' ? 'Script' : listen;
}

export interface ScriptsListProps {
  events: readonly ScriptView[];
  testId: string;
}

/**
 * The scripts declared at this scope, read-only.
 *
 * The notice is load-bearing trust UI (NFR-009): someone reading a stranger's collection has to
 * be told minim did not execute what they are looking at.
 */
export function ScriptsList({ events, testId }: ScriptsListProps) {
  if (events.length === 0) return <EmptySection what="Scripts" />;

  return (
    <section data-testid={testId}>
      <ul className="flex flex-col gap-4">
        {events.map((event, position) => (
          <li key={`${event.listen}:${position}`} data-testid="script-item">
            <div className="mb-1 flex items-center gap-2">
              <h4 className="text-xs font-medium">{scriptLabel(event.listen)}</h4>
              {event.disabled === true && (
                <span
                  data-testid="disabled-marker"
                  className="rounded-sm border px-1 text-[10px] text-muted-foreground"
                >
                  disabled
                </span>
              )}
            </div>
            <pre
              data-testid="script-source"
              className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs"
            >
              {event.source}
            </pre>
          </li>
        ))}
      </ul>
      <p data-testid="script-notice" className="mt-4 text-xs text-muted-foreground">
        {/* One source of truth for NFR-009's sentence — T-017 owns the wording. */}
        {SCRIPT_NOTICE}
      </p>
    </section>
  );
}

export interface BehaviorSectionProps {
  /** `protocolProfileBehavior`, flattened to display pairs by the Rust core. */
  behavior: readonly KeyValue[];
  /** Fields the v2.1 schema allows but minim has no dedicated surface for. */
  extra?: readonly KeyValue[];
  testId?: string;
}

/**
 * FR-034 — `protocolProfileBehavior`, shown only when the file declares it.
 *
 * It has no tab of its own: it is a handful of transport switches (`strictSSL`,
 * `followRedirects`), not a section a reader goes looking for, and a permanently empty seventh
 * tab would dilute the badge row that makes the other six worth scanning. It therefore renders
 * as a strip under the request header, and disappears entirely when absent.
 */
export function BehaviorSection({
  behavior,
  extra = [],
  testId = 'behavior',
}: BehaviorSectionProps) {
  const rows = [...behavior, ...extra];
  if (rows.length === 0) return null;

  return (
    <section
      data-testid={testId}
      className="shrink-0 border-b px-5 py-2"
      aria-label="Protocol profile behavior"
    >
      <h3 className={SECTION_TITLE_CLASS}>Behavior</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((row, position) => (
          <li
            key={`${row.key}:${position}`}
            data-testid="behavior-row"
            className="font-mono text-xs"
          >
            <span className="text-muted-foreground">{row.key}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              {' = '}
            </span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}

/** A titled block in the stacked folder view — the heading stays even when the body is `(none)`. */
export function DetailSection({ title, children, testId, className }: DetailSectionProps) {
  return (
    <section data-testid={testId} className={className}>
      <h3 className={SECTION_TITLE_CLASS}>{title}</h3>
      {children}
    </section>
  );
}
