import { Inbox } from 'lucide-react';

export interface EmptyCollectionProps {
  /** The parsed collection's name — required, because naming it is the whole point (FR-022). */
  collectionName: string;
}

/**
 * S9 — a collection that parsed fine and contains nothing.
 *
 * Naming the collection is what separates "this file has no requests" from "minim broke": a
 * blank pane reads as a bug, `"Billing API" has no requests` reads as a fact about the file.
 */
export function EmptyCollection({ collectionName }: EmptyCollectionProps) {
  const name = collectionName.trim() === '' ? 'This collection' : collectionName;

  return (
    <div
      data-testid="empty-collection"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <Inbox aria-hidden className="size-8 text-muted-foreground" />
      <p className="text-sm">
        <span className="font-medium">{name}</span> has no requests.
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The file was read and parsed successfully — it just contains no folders or requests yet.
      </p>
    </div>
  );
}
