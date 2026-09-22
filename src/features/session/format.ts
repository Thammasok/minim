import { fileName } from '@/lib/error-message';

/** "214 requests" / "1 request" — the recents row's secondary count. */
export function requestCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'request' : 'requests'}`;
}

/**
 * Middle-truncate a path, never head-truncate it.
 *
 * ux-design §S1: the file name is the identifying part of a recents row, so it is the last
 * thing to go. The head is sacrificed first, and the tail is grown to fit the whole file name
 * before the halves are balanced.
 */
export function middleTruncatePath(path: string, max = 44): string {
  if (max <= 1 || path.length <= max) return path;

  const keep = max - 1; // one character goes to the ellipsis
  const nameLength = fileName(path).length;
  const tail = Math.min(keep, Math.max(Math.ceil(keep / 2), Math.min(nameLength + 1, keep)));
  const head = keep - tail;

  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}
