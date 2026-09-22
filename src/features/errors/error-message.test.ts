import { describe, expect, it } from 'vitest';
import {
  errorMessage,
  fileNotFoundCopy,
  fileNotFoundMessage,
  isFatalError,
  schemaVersionLabel,
  warningCountLabel,
  warningMessage,
} from '@/lib/error-message';
import type { AppError, LoadWarningView } from '@/bindings';

/**
 * One sample per `AppError` variant. Typed as a full `Record` over the union's tags so that a
 * variant added to bindings.ts leaves this map incomplete — a compile error in the test as well
 * as in the mapping itself.
 */
const samples: Record<AppError['kind'], AppError> = {
  fileNotFound: { kind: 'fileNotFound', detail: { path: '/home/me/billing.json' } },
  fileUnreadable: {
    kind: 'fileUnreadable',
    detail: { path: '/home/me/billing.json', reason: 'permission denied' },
  },
  fileTooLarge: {
    kind: 'fileTooLarge',
    detail: { sizeBytes: 851443712, limitBytes: 67108864 },
  },
  notJson: { kind: 'notJson', detail: { line: 418, column: 12, message: 'expected value' } },
  notACollection: { kind: 'notACollection', detail: { missingField: 'item' } },
  unsupportedSchema: {
    kind: 'unsupportedSchema',
    detail: {
      found: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json',
      expected: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
  },
  noCollectionOpen: { kind: 'noCollectionOpen' },
  unknownNode: { kind: 'unknownNode', detail: { nodeId: 'n-42' } },
  unknownExample: { kind: 'unknownExample', detail: { nodeId: 'n-42', index: 3 } },
  storeUnavailable: {
    kind: 'storeUnavailable',
    detail: { operation: 'read', reason: 'config dir is read-only' },
  },
  notImplemented: { kind: 'notImplemented', detail: { command: 'reload_collection' } },
};

const warningSamples: Record<LoadWarningView['kind'], LoadWarningView> = {
  unknownAuthType: {
    kind: 'unknownAuthType',
    detail: { node_id: 'n-7', detail: 'hawk' },
  },
  unknownBodyMode: {
    kind: 'unknownBodyMode',
    detail: { node_id: 'n-8', detail: 'binary' },
  },
  malformedRawHeaderLine: {
    kind: 'malformedRawHeaderLine',
    detail: { node_id: 'n-9', detail: 'X-Trace no colon here' },
  },
  itemNeitherGroupNorRequest: {
    kind: 'itemNeitherGroupNorRequest',
    detail: { node_id: null, detail: 'item[3]' },
  },
  duplicateVariableKey: {
    kind: 'duplicateVariableKey',
    detail: { node_id: null, detail: 'baseUrl' },
  },
};

describe('errorMessage', () => {
  // AC-1: every AppError variant maps to distinct copy.
  it('gives every variant its own non-empty copy', () => {
    const summaries = new Set<string>();
    for (const [kind, error] of Object.entries(samples)) {
      const copy = errorMessage(error);
      expect(copy.title, kind).not.toBe('');
      expect(copy.summary, kind).not.toBe('');
      summaries.add(copy.summary);
    }
    expect(summaries.size).toBe(Object.keys(samples).length);
  });

  it('marks only storeUnavailable as a non-fatal notice', () => {
    for (const [kind, error] of Object.entries(samples)) {
      expect(isFatalError(error), kind).toBe(kind !== 'storeUnavailable');
    }
    expect(errorMessage(samples.storeUnavailable).severity).toBe('notice');
  });

  it('names the file and says "no longer exists" for fileNotFound', () => {
    const copy = errorMessage(samples.fileNotFound);
    expect(copy.summary).toContain('billing.json');
    expect(copy.summary).toContain('no longer exists');
    // The recents repair path (T-014) reuses exactly this sentence.
    expect(copy.summary).toBe(fileNotFoundMessage('/home/me/billing.json'));
    expect(fileNotFoundCopy('/home/me/billing.json')).toEqual(copy);
  });

  it('reports size and limit in human units for fileTooLarge', () => {
    const copy = errorMessage(samples.fileTooLarge);
    expect(copy.summary).toContain('812 MB');
    expect(copy.summary).toContain('64 MB');
  });

  it('keeps notACollection worded apart from notJson', () => {
    const notJson = errorMessage(samples.notJson).summary;
    const notACollection = errorMessage(samples.notACollection).summary;
    expect(notJson).toContain("isn't valid JSON");
    expect(notACollection).toContain('valid JSON, but not a Postman collection');
    expect(notJson).not.toBe(notACollection);
  });

  it('uses 1-based positions in the unknownExample copy', () => {
    expect(errorMessage(samples.unknownExample).summary).toContain('position 4');
  });
});

describe('schemaVersionLabel', () => {
  it('reads the version out of a schema URL', () => {
    expect(
      schemaVersionLabel('https://schema.getpostman.com/json/collection/v2.0.0/collection.json')
    ).toBe('v2.0');
  });

  it('returns null when the URL carries no version', () => {
    expect(schemaVersionLabel('https://example.test/collection.json')).toBeNull();
  });
});

describe('warningMessage', () => {
  it('gives every warning variant its own title, reason and consequence', () => {
    const titles = new Set<string>();
    for (const [kind, warning] of Object.entries(warningSamples)) {
      const copy = warningMessage(warning);
      expect(copy.title, kind).not.toBe('');
      expect(copy.consequence, kind).not.toBe('');
      expect(copy.detail, kind).toBe(warning.detail.detail);
      expect(copy.nodeId, kind).toBe(warning.detail.node_id);
      titles.add(copy.title);
    }
    expect(titles.size).toBe(Object.keys(warningSamples).length);
  });
});

describe('warningCountLabel', () => {
  it('pluralises', () => {
    expect(warningCountLabel(1)).toBe('1 note');
    expect(warningCountLabel(2)).toBe('2 notes');
  });
});
