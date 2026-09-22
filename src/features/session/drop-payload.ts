/**
 * What a drag or a drop is carrying — decided before anything is read.
 *
 * FR-002 accepts exactly one `.json` file. Every other shape (several files, a folder, a
 * non-json file) is rejected *here*, in the webview, so no command is invoked and nothing
 * on disk is touched. That ordering is the acceptance criterion, not an optimisation.
 */
export type DropPayload =
  /** Nothing file-like in the drag — a text selection. No overlay, no message. */
  | { kind: 'none' }
  /** Exactly one `.json`, with a path the Rust core can open. */
  | { kind: 'file'; path: string }
  | { kind: 'rejected'; reason: DropRejection };

export type DropRejection = 'multiple' | 'directory' | 'notJson' | 'noPath';

/**
 * The subset of `DataTransfer` this module reads.
 *
 * Typed structurally because jsdom has no `DataTransfer` constructor: a test hands in a plain
 * object with the same three fields, and a real `DataTransfer` is assignable to it.
 */
export interface DropSource {
  readonly files?: ArrayLike<File> | null;
  readonly items?: ArrayLike<DataTransferItem> | null;
  readonly types?: readonly string[];
}

/** A `File` as a desktop webview hands it over — augmented with its absolute path. */
interface PathfulFile extends File {
  readonly path?: unknown;
}

const JSON_EXTENSION = '.json';

function toArray<T>(list: ArrayLike<T> | null | undefined): T[] {
  if (list === null || list === undefined) return [];
  return Array.prototype.slice.call(list) as T[];
}

/**
 * True when the drag carries files at all.
 *
 * `dragover` deliberately exposes no file contents or names, only `types`/`items` kinds — so
 * this is all the overlay can key on, and why the overlay shows for a folder or a `.txt` too
 * (TC-COMP-031: the rejection is a message on drop, not a refusal to acknowledge the drag).
 */
export function carriesFiles(source: DropSource | null | undefined): boolean {
  if (source === null || source === undefined) return false;
  if (source.types?.includes('Files') === true) return true;
  if (toArray(source.items).some((item) => item.kind === 'file')) return true;
  return toArray(source.files).length > 0;
}

/** The absolute path of a dropped file; `null` when the webview exposed none. */
function pathOf(file: File): string | null {
  const path = (file as PathfulFile).path;
  if (typeof path === 'string' && path.length > 0) return path;
  // A plain browser gives a name only. Keep it rather than dropping the drop on the floor —
  // the Rust core reports FileNotFound, which is the honest outcome there.
  return file.name.length > 0 ? file.name : null;
}

function isDirectoryEntry(item: DataTransferItem | undefined): boolean {
  if (item === undefined) return false;
  const getEntry = item.webkitGetAsEntry?.bind(item);
  if (typeof getEntry !== 'function') return false;
  return getEntry()?.isDirectory === true;
}

/** `/a/b/Billing.JSON` → true. Case-insensitive, extension only — no read, no sniffing. */
function looksLikeJson(path: string): boolean {
  return path.toLowerCase().endsWith(JSON_EXTENSION);
}

/** Classify a drop before touching anything. The whole decision table of TC-COMP-031. */
export function classifyDrop(source: DropSource | null | undefined): DropPayload {
  if (source === null || source === undefined) return { kind: 'none' };

  const files = toArray(source.files);
  const items = toArray(source.items).filter((item) => item.kind === 'file');

  const count = Math.max(files.length, items.length);
  if (count === 0) return { kind: 'none' };
  if (count > 1) return { kind: 'rejected', reason: 'multiple' };
  if (isDirectoryEntry(items[0])) return { kind: 'rejected', reason: 'directory' };

  const file = files[0];
  if (file === undefined) return { kind: 'rejected', reason: 'noPath' };

  const path = pathOf(file);
  if (path === null) return { kind: 'rejected', reason: 'noPath' };
  if (!looksLikeJson(file.name.length > 0 ? file.name : path)) {
    return { kind: 'rejected', reason: 'notJson' };
  }

  return { kind: 'file', path };
}

/**
 * The same decision for a list of paths.
 *
 * Kept separate from the DOM so the OS-level drag-drop channel (Tauri's
 * `onDragDropEvent`, which reports `paths: string[]`) can reuse the identical rules.
 */
export function classifyPaths(paths: readonly string[]): DropPayload {
  if (paths.length === 0) return { kind: 'none' };
  if (paths.length > 1) return { kind: 'rejected', reason: 'multiple' };
  const path = paths[0];
  if (path === undefined || path.length === 0) return { kind: 'rejected', reason: 'noPath' };
  if (!looksLikeJson(path)) return { kind: 'rejected', reason: 'notJson' };
  return { kind: 'file', path };
}

/** Why the drop was refused, in user vocabulary — named cause plus the fix. */
export function dropRejectionMessage(reason: DropRejection): string {
  switch (reason) {
    case 'multiple':
      return 'minim opens one collection at a time. Drop a single .json file.';
    case 'directory':
      return "That's a folder. Drop the .json collection file inside it.";
    case 'notJson':
      return 'minim opens Postman collections exported as .json.';
    case 'noPath':
      return "minim couldn't tell where that file is. Use Open collection… instead.";
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled drop rejection: ${String(exhaustive)}`);
    }
  }
}
