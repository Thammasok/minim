import type { TreeNode } from '@/bindings';

/**
 * Tiny builders for `TreeNode` summaries. The real DTO comes from the Rust core; these
 * only exist so the tree's own tests can state a shape in one line instead of ten.
 */

export function request(
  id: string,
  name: string,
  options: { method?: string; urlPreview?: string; folderPath?: string[] } = {}
): TreeNode {
  return {
    id,
    name,
    kind: 'request',
    folderPath: options.folderPath ?? [],
    method: options.method ?? 'GET',
    urlPreview: options.urlPreview ?? '{{baseUrl}}/things',
    children: [],
    exampleCount: 0,
    hasScripts: false,
  };
}

export function folder(
  id: string,
  name: string,
  children: TreeNode[] = [],
  folderPath: string[] = []
): TreeNode {
  return {
    id,
    name,
    kind: 'folder',
    folderPath,
    method: null,
    urlPreview: null,
    children,
    exampleCount: 0,
    hasScripts: false,
  };
}
