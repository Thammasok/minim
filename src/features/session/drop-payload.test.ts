import { describe, expect, it } from 'vitest';
import { carriesFiles, classifyDrop, classifyPaths, dropRejectionMessage } from './drop-payload';
import type { DropSource } from './drop-payload';

function fileAt(path: string, type = 'application/json'): File {
  const name = path.split('/').pop() ?? path;
  const file = new File(['{}'], name, { type });
  Object.defineProperty(file, 'path', { value: path });
  return file;
}

function transfer(files: File[], overrides: Partial<DropSource> = {}): DropSource {
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type }) as DataTransferItem),
    types: ['Files'],
    ...overrides,
  };
}

const directoryItem = {
  kind: 'file',
  type: '',
  webkitGetAsEntry: () => ({ isDirectory: true, isFile: false }),
} as unknown as DataTransferItem;

// TC-COMP-031 — the drop-target decision table, decided before anything is read.
describe('classifyDrop', () => {
  it('(a) accepts exactly one .json and reports its path', () => {
    expect(classifyDrop(transfer([fileAt('/a/b.json')]))).toEqual({
      kind: 'file',
      path: '/a/b.json',
    });
  });

  it('(b) rejects several files', () => {
    expect(classifyDrop(transfer([fileAt('/a.json'), fileAt('/b.json')]))).toEqual({
      kind: 'rejected',
      reason: 'multiple',
    });
  });

  it('(c) rejects a folder', () => {
    const folder = fileAt('/collections', '');
    expect(classifyDrop(transfer([folder], { items: [directoryItem] }))).toEqual({
      kind: 'rejected',
      reason: 'directory',
    });
  });

  it('(d) rejects a non-json file', () => {
    expect(classifyDrop(transfer([fileAt('/a/notes.txt', 'text/plain')]))).toEqual({
      kind: 'rejected',
      reason: 'notJson',
    });
  });

  it('(e) treats a drag with no files as nothing at all', () => {
    expect(classifyDrop({ files: [], items: [], types: ['text/plain'] })).toEqual({ kind: 'none' });
    expect(classifyDrop(null)).toEqual({ kind: 'none' });
  });

  it('matches the extension case-insensitively', () => {
    expect(classifyDrop(transfer([fileAt('/a/Billing.JSON')]))).toEqual({
      kind: 'file',
      path: '/a/Billing.JSON',
    });
  });

  it('falls back to the file name when the webview exposes no path', () => {
    const file = new File(['{}'], 'b.json', { type: 'application/json' });
    expect(classifyDrop(transfer([file]))).toEqual({ kind: 'file', path: 'b.json' });
  });
});

describe('carriesFiles', () => {
  it('is true for a file drag and false for a text selection', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true);
    expect(carriesFiles({ items: [{ kind: 'file' } as DataTransferItem] })).toBe(true);
    expect(carriesFiles({ types: ['text/plain'], items: [], files: [] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });
});

// The OS-level drag-drop channel reports paths rather than File objects; same rules apply.
describe('classifyPaths', () => {
  it('applies the identical decision table to a list of paths', () => {
    expect(classifyPaths(['/a/b.json'])).toEqual({ kind: 'file', path: '/a/b.json' });
    expect(classifyPaths(['/a.json', '/b.json'])).toEqual({ kind: 'rejected', reason: 'multiple' });
    expect(classifyPaths(['/a/notes.txt'])).toEqual({ kind: 'rejected', reason: 'notJson' });
    expect(classifyPaths([])).toEqual({ kind: 'none' });
  });
});

describe('dropRejectionMessage', () => {
  it('names the cause for every rejection', () => {
    expect(dropRejectionMessage('multiple')).toContain('one collection at a time');
    expect(dropRejectionMessage('directory')).toContain('folder');
    expect(dropRejectionMessage('notJson')).toContain('.json');
    expect(dropRejectionMessage('noPath')).toContain('Open collection');
  });
});
