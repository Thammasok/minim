import { cn } from '@/lib/utils';
import { VariableText } from './variable-token';
import type { VariableIndex } from './variables';

/** One display row, normalized from `ParamView` / `HeaderView` / anything else key-value. */
export interface KeyValueRow {
  key: string;
  value: string | null;
  /** `disabled: true` in the file. `null`/absent means enabled. */
  disabled: boolean;
  description: string;
}

export interface KeyValueTableProps {
  rows: readonly KeyValueRow[];
  /** Names the table for assistive tech — "Query parameters", "Headers". */
  caption: string;
  testId: string;
  variables: VariableIndex;
}

const HEAD_CLASS =
  'py-1 pr-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase';
const CELL_CLASS = 'py-1.5 pr-3 align-top';

/**
 * The key/value table behind FR-024 and FR-025.
 *
 * A disabled entry is **marked, never hidden** — a request whose `dryRun=true` is switched off
 * reads completely differently from one that never had it, and dropping the row would make the
 * two identical. TC-COMP-013 requires three independent signals, so a disabled row carries
 * strike-through *and* muted colour *and* a literal "disabled" label: colour alone fails
 * NFR-011, and strike-through alone does not survive a screen reader.
 */
export function KeyValueTable({ rows, caption, testId, variables }: KeyValueTableProps) {
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
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            // Keys repeat legally in a query string, so position is part of the identity.
            key={`${row.key}:${index}`}
            data-testid="kv-row"
            data-disabled={row.disabled ? 'true' : undefined}
            className={cn(
              'border-b last:border-0 hover:bg-muted/40',
              row.disabled && 'text-muted-foreground'
            )}
          >
            <td
              className={cn(
                CELL_CLASS,
                'font-mono text-xs break-all',
                row.disabled && 'line-through'
              )}
            >
              {row.key === '' ? (
                <span className="text-muted-foreground italic">(no key)</span>
              ) : (
                <VariableText text={row.key} variables={variables} />
              )}
            </td>
            <td
              className={cn(
                CELL_CLASS,
                'font-mono text-xs break-all',
                row.disabled && 'line-through'
              )}
            >
              {row.value === null || row.value === '' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <VariableText text={row.value} variables={variables} />
              )}
            </td>
            <td className={cn(CELL_CLASS, 'text-xs')}>
              {row.description !== '' && <span className="mr-2">{row.description}</span>}
              {row.disabled && (
                <span
                  data-testid="disabled-marker"
                  // inline-block starts a new decoration root, so the row's strike-through
                  // does not run through the word that explains the strike-through.
                  className="inline-block rounded-sm border px-1 text-[10px] no-underline"
                >
                  disabled
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
