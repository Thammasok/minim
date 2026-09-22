export { RequestDetail, RequestDetailView } from './request-detail';
export type { RequestDetailProps, RequestDetailViewProps } from './request-detail';

export { DetailHeader } from './detail-header';
export type { DetailHeaderProps } from './detail-header';

export { DetailTabs } from './detail-tabs';
export type { DetailTabsProps } from './detail-tabs';

export { ParamsTable } from './params-table';
export type { ParamsTableProps } from './params-table';

export { HeadersTable } from './headers-table';
export type { HeadersTableProps } from './headers-table';

export { KeyValueTable } from './kv-table';
export type { KeyValueRow, KeyValueTableProps } from './kv-table';

export { EmptySection } from './empty-section';

export { BodyPanel } from './body-panel';
export type { BodyPanelProps } from './body-panel';

export { AuthPanel } from './auth-panel';
export type { AuthPanelProps } from './auth-panel';

export { ScriptsPanel, SCRIPT_NOTICE } from './scripts-panel';
export type { ScriptsPanelProps } from './scripts-panel';

export { CodeBlock } from './code-block';
export type { CodeBlockProps } from './code-block';
export { VariableText, VariableToken, UNDEFINED_VARIABLE_HINT } from './variable-token';

export {
  authBadge,
  bodyBadge,
  breadcrumbSegments,
  buildTabs,
  firstNonEmptyTabId,
  INHERITED_BADGE,
  NONE_BADGE,
  NONE_LABEL,
  TAB_IDS,
} from './detail-model';
export type { BreadcrumbSegment, TabDescriptor, TabId } from './detail-model';

export {
  buildVariableIndex,
  EMPTY_VARIABLE_INDEX,
  hasVariables,
  isVariableDefined,
  tokenizeVariables,
} from './variables';
export type { VariableIndex, VariableSegment } from './variables';

export { ExamplesPanel } from './examples-panel';
export type { ExamplesPanelProps } from './examples-panel';

export { CollectionDetail } from './collection-detail';
export type { CollectionDetailProps } from './collection-detail';

export { FolderDetailView } from './folder-detail';
export type { FolderDetailViewProps } from './folder-detail';

export {
  AuthSummary,
  BehaviorSection,
  DetailSection,
  ScriptsList,
  VariablesTable,
} from './metadata-sections';
export type {
  AuthSummaryProps,
  BehaviorSectionProps,
  DetailSectionProps,
  ScriptsListProps,
  VariablesTableProps,
} from './metadata-sections';

export { collectRequestIds, countVariableUsage, useVariableUsage } from './variable-usage';
export type { RequestRefs, VariableUsage } from './variable-usage';
