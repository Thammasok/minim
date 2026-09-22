import type { HeaderView } from '@/bindings';
import { EmptySection } from './empty-section';
import { KeyValueTable, type KeyValueRow } from './kv-table';
import type { VariableIndex } from './variables';

export interface HeadersTableProps {
  headers: readonly HeaderView[];
  variables: VariableIndex;
}

function toRow(header: HeaderView): KeyValueRow {
  return {
    key: header.key,
    value: header.value,
    disabled: header.disabled === true,
    description: header.description,
  };
}

/** FR-025 — headers as key/value rows, disabled entries marked rather than dropped. */
export function HeadersTable({ headers, variables }: HeadersTableProps) {
  if (headers.length === 0) return <EmptySection what="Headers" />;
  return (
    <KeyValueTable
      rows={headers.map(toRow)}
      caption="Headers"
      testId="headers-table"
      variables={variables}
    />
  );
}
