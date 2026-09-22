import type { AppError, LoadWarningView } from '@/bindings';

/**
 * Copy for every failure the backend can report (design.md § AppError wire shape).
 *
 * The whole point of `AppError` being a structured union rather than a string is that each
 * variant gets copy that names the actual cause *and* the fix (design review heuristic #9).
 * `errorMessage` is therefore an exhaustive switch: a variant added to `bindings.ts` without a
 * branch here fails `tsc` on the `never` assignment at the bottom, not code review.
 */

/** A label/value row rendered verbatim — file paths, schema URLs, serde messages. */
export interface ErrorFact {
  label: string;
  value: string;
}

/**
 * `fatal` blocks the surface it belongs to and is shown in the error dialog.
 * `notice` keeps the app usable and is shown as a dismissible banner (ADR-013 — a store
 * failure degrades persistence only; the collection is open and readable).
 */
export type ErrorSeverity = 'fatal' | 'notice';

export interface ErrorCopy {
  /** Dialog / banner heading. */
  title: string;
  /** The file or node the failure is about, when there is one. */
  subject: string | null;
  /** One sentence naming the cause, in user vocabulary. */
  summary: string;
  /** Second sentence — the consequence or the reported position. */
  detail: string | null;
  /** Verbatim values out of the file or the OS. Never interpreted, only displayed. */
  facts: ErrorFact[];
  /** What the user can do about it, when there is something. */
  fix: string | null;
  severity: ErrorSeverity;
}

const V21_SCHEMA_HINT = 'v2.1';

/** The file name out of a full path, for headings; the full path stays in the facts. */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} bytes`;
  const mb = kb / 1024;
  if (mb < 1) return `${Math.round(kb)} KB`;
  const gb = mb / 1024;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** `…/json/collection/v2.0.0/collection.json` → `v2.0`; null when the URL says nothing. */
export function schemaVersionLabel(schemaUrl: string): string | null {
  const match = /v(\d+)\.(\d+)/.exec(schemaUrl);
  if (!match) return null;
  return `v${match[1]}.${match[2]}`;
}

/**
 * The one-line `FileNotFound` message.
 *
 * Shared with the recents repair path (T-014): a recents row whose file has gone shows this
 * sentence beside its own "Remove from recents" action, so the wording stays identical whether
 * the user hits it from the dialog or from the list.
 */
export function fileNotFoundMessage(path: string): string {
  return `${fileName(path)} no longer exists at that path.`;
}

/** The full `FileNotFound` copy — same source of truth as `fileNotFoundMessage`. */
export function fileNotFoundCopy(path: string): ErrorCopy {
  return {
    title: "Couldn't open this file",
    subject: fileName(path),
    summary: fileNotFoundMessage(path),
    detail: 'It may have been moved, renamed or deleted since it was last opened.',
    facts: [{ label: 'path', value: path }],
    fix: 'Pick another file, or remove this entry from recents.',
    severity: 'fatal',
  };
}

export function errorMessage(error: AppError): ErrorCopy {
  switch (error.kind) {
    case 'fileNotFound':
      return fileNotFoundCopy(error.detail.path);

    case 'fileUnreadable':
      return {
        title: "Couldn't read this file",
        subject: fileName(error.detail.path),
        summary: `minim couldn't read ${fileName(error.detail.path)}.`,
        detail: 'The path exists, but the file could not be opened as text.',
        facts: [
          { label: 'path', value: error.detail.path },
          { label: 'reason', value: error.detail.reason },
        ],
        fix: "Check that it's a file rather than a folder, and that you have permission to read it.",
        severity: 'fatal',
      };

    case 'fileTooLarge':
      return {
        title: 'This file is too large',
        subject: null,
        summary: `This file is ${formatBytes(error.detail.sizeBytes)}. minim reads collections up to ${formatBytes(error.detail.limitBytes)}.`,
        detail: 'The limit is checked before anything is read, so nothing was loaded.',
        facts: [
          { label: 'size', value: `${error.detail.sizeBytes} bytes` },
          { label: 'limit', value: `${error.detail.limitBytes} bytes` },
        ],
        fix: 'Split the collection in Postman, or open a smaller export.',
        severity: 'fatal',
      };

    case 'notJson':
      return {
        title: "Couldn't open this file",
        subject: null,
        summary: "This file isn't valid JSON.",
        detail: `Parse error at line ${error.detail.line}, column ${error.detail.column}.`,
        facts: [
          { label: 'line', value: String(error.detail.line) },
          { label: 'column', value: String(error.detail.column) },
          { label: 'reported', value: error.detail.message },
        ],
        fix: 'Open the file at that position in an editor, or re-export it from Postman.',
        severity: 'fatal',
      };

    case 'notACollection':
      return {
        title: "Couldn't open this file",
        subject: null,
        // Deliberately worded away from the NotJson case: the syntax was fine, the shape wasn't.
        summary: 'This is valid JSON, but not a Postman collection.',
        detail: `Missing required field: ${error.detail.missingField}`,
        facts: [{ label: 'missing field', value: error.detail.missingField }],
        fix: 'Open a file exported from Postman as a collection, not an environment or a response.',
        severity: 'fatal',
      };

    case 'unsupportedSchema': {
      const found = schemaVersionLabel(error.detail.found);
      return {
        title: "Couldn't open this file",
        subject: null,
        summary: found
          ? `This is a Postman ${found} collection.`
          : "This collection's schema isn't one minim reads.",
        detail: `minim reads ${V21_SCHEMA_HINT} only — that's the format Newman runs.`,
        facts: [
          { label: 'found', value: error.detail.found },
          { label: 'expected', value: error.detail.expected },
        ],
        fix: `In Postman: Export → Collection ${V21_SCHEMA_HINT} (recommended).`,
        severity: 'fatal',
      };
    }

    case 'noCollectionOpen':
      return {
        title: 'No collection is open',
        subject: null,
        summary: 'That action needs an open collection.',
        detail: 'The collection was closed, or it was never opened in this session.',
        facts: [],
        fix: 'Open a collection first.',
        severity: 'fatal',
      };

    case 'unknownNode':
      return {
        title: "That item isn't in this collection",
        subject: null,
        summary: "minim can't find that folder or request any more.",
        detail: 'The collection on disk may have changed since it was opened.',
        facts: [{ label: 'node', value: error.detail.nodeId }],
        fix: 'Reload the collection to rebuild the tree.',
        severity: 'fatal',
      };

    case 'unknownExample':
      return {
        title: "That saved response isn't there",
        subject: null,
        summary: `This request has no saved response at position ${error.detail.index + 1}.`,
        detail: 'The collection on disk may have changed since it was opened.',
        facts: [
          { label: 'node', value: error.detail.nodeId },
          { label: 'index', value: String(error.detail.index) },
        ],
        fix: 'Reload the collection to rebuild the list of saved responses.',
        severity: 'fatal',
      };

    case 'storeUnavailable':
      // ADR-013: non-fatal by construction — open_collection still succeeds when the store is
      // broken, so this must never block the collection the user just opened.
      return {
        title:
          error.detail.operation === 'read'
            ? "Couldn't read minim's saved state"
            : "Couldn't save minim's state",
        subject: null,
        summary:
          'Your collection is open and fully usable — only minim’s own saved state is affected.',
        detail:
          error.detail.operation === 'read'
            ? 'Recent files and theme preference start empty this session.'
            : "Recent files and theme preference won't be remembered after you quit.",
        facts: [
          { label: 'operation', value: error.detail.operation },
          { label: 'reason', value: error.detail.reason },
        ],
        fix: 'Check that minim can write to its application config folder, then restart it.',
        severity: 'notice',
      };

    case 'notImplemented':
      return {
        title: 'Not built yet',
        subject: null,
        summary: `The ${error.detail.command} command isn't implemented in this build.`,
        detail: 'This is a development build; the shipped app never reports this.',
        facts: [{ label: 'command', value: error.detail.command }],
        fix: null,
        severity: 'fatal',
      };

    default: {
      // Adding an AppError variant in bindings.ts without copy above is a compile error here.
      const exhaustive: never = error;
      throw new Error(`Unhandled AppError variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** True when the error blocks the surface — i.e. belongs in the dialog rather than a banner. */
export function isFatalError(error: AppError): boolean {
  return errorMessage(error).severity === 'fatal';
}

/** Copy for one load warning (S10). Warnings are notes, never failures. */
export interface WarningCopy {
  /** What went wrong, in user vocabulary. */
  title: string;
  /** The verbatim offending value out of the file. */
  detail: string;
  /** What minim did instead — so the user knows what they are looking at. */
  consequence: string;
  /** Node the warning belongs to; null means the collection itself. */
  nodeId: string | null;
}

export function warningMessage(warning: LoadWarningView): WarningCopy {
  const nodeId = warning.detail.node_id;
  switch (warning.kind) {
    case 'unknownAuthType':
      return {
        title: 'Unknown auth type',
        detail: warning.detail.detail,
        consequence: 'Shown as raw values.',
        nodeId,
      };
    case 'unknownBodyMode':
      return {
        title: 'Unknown body mode',
        detail: warning.detail.detail,
        consequence: 'Shown as raw text.',
        nodeId,
      };
    case 'malformedRawHeaderLine':
      return {
        title: 'Header line without ":"',
        detail: warning.detail.detail,
        consequence: 'That line was skipped.',
        nodeId,
      };
    case 'itemNeitherGroupNorRequest':
      return {
        title: 'Item is neither a folder nor a request',
        detail: warning.detail.detail,
        consequence: 'That item was skipped.',
        nodeId,
      };
    case 'duplicateVariableKey':
      return {
        title: 'Duplicate variable key',
        detail: warning.detail.detail,
        consequence: 'The first declaration wins.',
        nodeId,
      };
    default: {
      // Same compile-time guarantee as errorMessage.
      const exhaustive: never = warning;
      throw new Error(`Unhandled LoadWarningView variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** "2 notes" / "1 note" — the status-bar count that survives dismissing the banner. */
export function warningCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'note' : 'notes'}`;
}
