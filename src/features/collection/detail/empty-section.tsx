import { NONE_LABEL } from './detail-model';

export interface EmptySectionProps {
  /**
   * What is absent, for assistive tech — "No headers". The visible text stays the literal
   * "(none)" the spec asks for; this only stops a screen reader hearing six bare "(none)"s.
   */
  what?: string;
}

/**
 * FR-036 — an empty section states its absence.
 *
 * Hiding the heading would make "this request has no headers" indistinguishable from "minim
 * failed to read the headers", which is exactly the ambiguity the requirement exists to remove.
 */
export function EmptySection({ what }: EmptySectionProps) {
  return (
    <p
      data-testid="empty-section"
      aria-label={what === undefined ? undefined : `${what}: ${NONE_LABEL}`}
      className="py-6 text-center text-sm text-muted-foreground"
    >
      {NONE_LABEL}
    </p>
  );
}
