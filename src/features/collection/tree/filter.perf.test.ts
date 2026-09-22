import { beforeAll, describe, expect, it } from 'vitest';
import type { TreeNode } from '@/bindings';
import { computeFilter } from './filter';
import { countRequests, flattenTree } from './tree-model';

/**
 * NFR-002 — filtering the 2,000-leaf fixture must land inside 150 ms p95.
 *
 * The fixture is generated, not committed (see `.gitignore`), so `import.meta.glob`
 * resolves to nothing when it is absent and the suite falls back to a deterministic tree
 * of the same size and shape rather than skipping the budget. What is measured is the whole
 * client-side filter pipeline — match + ancestor retention + re-flatten — because that is
 * the work one keystroke triggers; React then re-renders only the ~20 rows the virtual
 * window holds.
 *
 * Regenerate the fixture with:
 *   node tests/fixtures/tools/generate-large.mjs --seed 0 --leaves 2000
 */

const fixtures = import.meta.glob('../../../../tests/fixtures/large/collection-2000-seed0.json', {
  import: 'default',
});

type RawItem = {
  name?: unknown;
  item?: unknown;
  request?: { method?: unknown; url?: unknown } | string;
};

function rawUrl(url: unknown): string | null {
  if (typeof url === 'string') return url;
  if (url !== null && typeof url === 'object' && 'raw' in url) {
    const raw = (url as { raw?: unknown }).raw;
    if (typeof raw === 'string') return raw;
  }
  return null;
}

function toTreeNodes(items: readonly RawItem[], prefix: string): TreeNode[] {
  return items.map((item, index) => {
    const id = `${prefix}${index}`;
    const name = typeof item.name === 'string' ? item.name : '';
    const children = Array.isArray(item.item) ? (item.item as RawItem[]) : null;
    if (children !== null) {
      return {
        id,
        name,
        kind: 'folder',
        folderPath: [],
        method: null,
        urlPreview: null,
        children: toTreeNodes(children, `${id}.`),
        exampleCount: 0,
        hasScripts: false,
      };
    }
    const req = typeof item.request === 'object' && item.request !== null ? item.request : {};
    return {
      id,
      name,
      kind: 'request',
      folderPath: [],
      method: typeof req.method === 'string' ? req.method : 'GET',
      urlPreview: rawUrl(req.url),
      children: [],
      exampleCount: 0,
      hasScripts: false,
    };
  });
}

/** Same leaf count and roughly the same nesting as the generated fixture. */
function syntheticTree(leaves: number): TreeNode[] {
  const resources = ['invoices', 'accounts', 'orders', 'payments', 'refunds', 'webhooks'];
  const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const roots: TreeNode[] = [];
  let made = 0;
  for (let a = 0; made < leaves; a += 1) {
    const inner: TreeNode[] = [];
    for (let b = 0; b < 5 && made < leaves; b += 1) {
      const items: TreeNode[] = [];
      for (let c = 0; c < 8 && made < leaves; c += 1, made += 1) {
        const resource = resources[made % resources.length] ?? 'things';
        items.push({
          id: `r${made}`,
          name: `${verbs[made % verbs.length] ?? 'GET'} ${resource} ${made}`,
          kind: 'request',
          folderPath: [],
          method: verbs[made % verbs.length] ?? 'GET',
          urlPreview: `{{baseUrl}}/v1/${resource}/${made}?expand=true`,
          children: [],
          exampleCount: 0,
          hasScripts: false,
        });
      }
      inner.push({
        id: `f${a}.${b}`,
        name: `${resources[b % resources.length] ?? 'group'} ${b}`,
        kind: 'folder',
        folderPath: [],
        method: null,
        urlPreview: null,
        children: items,
        exampleCount: 0,
        hasScripts: false,
      });
    }
    roots.push({
      id: `f${a}`,
      name: `Area ${a}`,
      kind: 'folder',
      folderPath: [],
      method: null,
      urlPreview: null,
      children: inner,
      exampleCount: 0,
      hasScripts: false,
    });
  }
  return roots;
}

async function loadTree(): Promise<TreeNode[]> {
  for (const load of Object.values(fixtures)) {
    const parsed: unknown = await load();
    const items =
      parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as RawItem).item)
        ? ((parsed as RawItem).item as RawItem[])
        : [];
    const tree = toTreeNodes(items, '');
    if (countRequests(tree) >= 2000) return tree;
  }
  return syntheticTree(2000);
}

function collectAllFolderIds(
  nodes: readonly TreeNode[],
  out: Set<string> = new Set()
): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'folder') out.add(node.id);
    collectAllFolderIds(node.children, out);
  }
  return out;
}

describe('filter performance on a 2,000-leaf collection', () => {
  let tree: TreeNode[] = [];
  let expandedIds = new Set<string>();

  beforeAll(async () => {
    tree = await loadTree();
    expandedIds = collectAllFolderIds(tree);
  }, 60_000);

  it('has at least 2,000 request leaves to measure against', () => {
    expect(countRequests(tree)).toBeGreaterThanOrEqual(2000);
  });

  // NFR-002 — 150 ms p95 per filter update
  it('recomputes the visible list well inside 150 ms p95', () => {
    const queries = ['a', 'in', 'inv', 'invo', 'invoi', 'get', 'post', 'v1', '{{base', 'zzz'];
    const samples: number[] = [];

    for (let round = 0; round < 5; round += 1) {
      for (const query of queries) {
        const started = performance.now();
        const result = computeFilter(tree, query);
        flattenTree(tree, {
          expandedIds,
          visibleIds: result.visibleIds,
          matchIds: result.matchIds,
        });
        samples.push(performance.now() - started);
      }
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] ?? 0;
    expect(p95).toBeLessThan(150);
  });
});
