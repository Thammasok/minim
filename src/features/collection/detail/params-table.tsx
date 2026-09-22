import type { ParamView } from '@/bindings';
import { EmptySection } from './empty-section';
import { KeyValueTable, type KeyValueRow } from './kv-table';
import type { VariableIndex } from './variables';

export interface ParamsTableProps {
  params: readonly ParamView[];
  /** "Query parameters" / "Path variables" — also the table's accessible name. */
  caption: string;
  testId: string;
  variables: VariableIndex;
}

function toRow(param: ParamView): KeyValueRow {
  return {
    key: param.key,
    value: param.value,
    // The wire carries `true | false | null`; only an explicit `true` disables.
    disabled: param.disabled === true,
    description: param.description,
  };
}

/** FR-024 — query parameters and path variables, with their disabled state and description. */
export function ParamsTable({ params, caption, testId, variables }: ParamsTableProps) {
  if (params.length === 0) return <EmptySection what={caption} />;
  return (
    <KeyValueTable
      rows={params.map(toRow)}
      caption={caption}
      testId={testId}
      variables={variables}
    />
  );
}
