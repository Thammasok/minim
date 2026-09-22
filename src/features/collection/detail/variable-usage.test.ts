import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '@/bindings';
import { collectRequestIds, countVariableUsage } from './variable-usage';

// The module pulls `commands` in for its hook; jsdom has no Tauri runtime.
vi.mock('@/bindings', () => ({ commands: {} }));

function refs(...names: string[]) {
  return { variableRefs: names.map((name) => ({ name, defined: true })) };
}

function node(id: string, kind: TreeNode['kind'], children: TreeNode[] = []): TreeNode {
  return {
    id,
    name: id,
    kind,
    folderPath: [],
    method: kind === 'request' ? 'GET' : null,
    urlPreview: kind === 'request' ? '{{baseUrl}}/x' : null,
    children,
    exampleCount: 0,
    hasScripts: false,
  };
}

describe('countVariableUsage (FR-038 USED column)', () => {
  it('counts referencing requests, not occurrences', () => {
    // TC-UNIT-043 — `{{baseUrl}}` twice in one request and once in another is 2, not 3.
    const counts = countVariableUsage([refs('baseUrl', 'baseUrl'), refs('baseUrl')]);
    expect(counts.get('baseUrl')).toBe(2);
  });

  it('leaves a variable nothing references out of the map, which the table reads as 0', () => {
    // TC-U-081 — three requests use baseUrl, nothing uses legacyId.
    const counts = countVariableUsage([
      refs('baseUrl'),
      refs('baseUrl', 'userEmail'),
      refs('baseUrl'),
    ]);

    expect(counts.get('baseUrl')).toBe(3);
    expect(counts.get('userEmail')).toBe(1);
    expect(counts.get('legacyId') ?? 0).toBe(0);
  });

  it('is empty for a collection with no requests', () => {
    expect(countVariableUsage([]).size).toBe(0);
  });
});

describe('collectRequestIds', () => {
  it('walks folders and returns request leaves in document order', () => {
    const tree = [
      node('f1', 'folder', [node('r2', 'request'), node('f2', 'folder', [node('r3', 'request')])]),
      node('r1', 'request'),
    ];

    expect(collectRequestIds(tree)).toEqual(['r2', 'r3', 'r1']);
  });
});
