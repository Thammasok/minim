import { useState, type ReactElement } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AuthAttrView, AuthSourceView, AuthView } from '@/bindings';
import { isMaskedAttribute, MASKED_VALUE } from '@/lib/mask';
import { cn } from '@/lib/utils';
import { INHERITED_BADGE } from './detail-model';
import { EmptySection } from './empty-section';
import { VariableText } from './variable-token';
import type { VariableIndex } from './variables';

/**
 * ux-design.md §S2b — the resolved auth, its inheritance chip and its masked values.
 *
 * Two requirements meet here. FR-030 says the panel must name *which level* the displayed auth
 * came from: "bearer" alone is ambiguous between a request that sets its own token and one that
 * silently borrows the collection's, and those debug very differently. FR-032 says a
 * credential-bearing value is masked behind a per-value reveal — not styled-out, *absent*: the
 * plaintext is never rendered until the user asks for it (TC-U-076).
 */

export interface AuthPanelProps {
  auth: AuthView;
  /** Reveal state must reset when this changes (FR-032 / TC-U-077). */
  nodeId: string;
  variables: VariableIndex;
}

/**
 * Auth types the v2.1 schema names (FR-031).
 *
 * minim renders every type from the same verbatim attribute list, so this set changes nothing
 * about *how* a type is drawn — it only decides whether the panel admits it has never heard of
 * this one. Without that admission an unknown type looks identical to a known one whose
 * attributes happen to be unfamiliar.
 */
const KNOWN_AUTH_TYPES: ReadonlySet<string> = new Set([
  'apikey',
  'awsv4',
  'basic',
  'bearer',
  'digest',
  'edgegrid',
  'hawk',
  'jwt',
  'noauth',
  'ntlm',
  'oauth1',
  'oauth2',
]);

interface SourceChip {
  text: string;
  /** Inherited sources get the `⊥` glyph of the tab badge; an own auth does not. */
  inherited: boolean;
}

/** FR-030 — the chip text, naming the level. Exhaustive on `AuthSourceView`. */
function authSourceLabel(source: AuthSourceView): SourceChip {
  switch (source.kind) {
    case 'own':
      return { text: 'defined on this request', inherited: false };
    case 'folder':
      return { text: `inherited from folder ${source.name}`, inherited: true };
    case 'collection':
      return { text: 'inherited from collection', inherited: true };
    case 'none':
      return { text: 'no auth anywhere on this path', inherited: false };
    default: {
      // A new AuthSourceView variant fails tsc here rather than showing an unlabelled chip.
      const exhaustive: never = source;
      throw new Error(`Unhandled AuthSourceView variant: ${JSON.stringify(exhaustive)}`);
    }
  }
}

interface AuthAttrRowProps {
  attr: AuthAttrView;
  variables: VariableIndex;
}

function AuthAttrRow({ attr, variables }: AuthAttrRowProps): ReactElement {
  const maskable = isMaskedAttribute(attr) && attr.value !== null && attr.value !== '';
  const [revealed, setRevealed] = useState(false);
  const masked = maskable && !revealed;

  return (
    <tr
      data-testid="auth-attr"
      data-key={attr.key}
      data-sensitive={maskable ? 'true' : undefined}
      data-masked={masked ? 'true' : 'false'}
      className="border-b last:border-0 hover:bg-muted/40"
    >
      <td className="w-40 py-1.5 pr-3 align-top font-mono text-xs break-all">{attr.key}</td>
      <td className="py-1.5 pr-3 align-top font-mono text-xs break-all">
        <span data-testid="auth-attr-value">
          {attr.value === null || attr.value === '' ? (
            <span className="text-muted-foreground">—</span>
          ) : masked ? (
            // Constant-width bullets, and the plaintext is not in the tree at all.
            <span aria-label="hidden value">{MASKED_VALUE}</span>
          ) : (
            <VariableText text={attr.value} variables={variables} />
          )}
        </span>
      </td>
      <td className="w-10 py-1.5 align-top">
        {maskable && (
          <button
            type="button"
            data-testid="auth-reveal"
            aria-pressed={revealed}
            aria-label={`${revealed ? 'Hide' : 'Reveal'} ${attr.key}`}
            title={`${revealed ? 'Hide' : 'Reveal'} ${attr.key}`}
            onClick={() => setRevealed((value) => !value)}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {revealed ? (
              <EyeOff aria-hidden="true" className="size-3.5" />
            ) : (
              <Eye aria-hidden="true" className="size-3.5" />
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

function AuthPanelView({ auth, variables }: { auth: AuthView; variables: VariableIndex }) {
  const chip = authSourceLabel(auth.source);
  const known = KNOWN_AUTH_TYPES.has(auth.authType.trim().toLowerCase());

  if (auth.source.kind === 'none') {
    // FR-036 — nothing anywhere on the inheritance path says so out loud.
    return <EmptySection what="Auth" />;
  }

  return (
    <div data-testid="auth-panel" data-known-type={String(known)} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="auth-source"
          data-source={auth.source.kind}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]',
            chip.inherited ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {chip.inherited && <span aria-hidden="true">{INHERITED_BADGE}</span>}
          {chip.text}
        </span>
        <span data-testid="auth-type" className="font-mono text-sm">
          {auth.authType}
        </span>
        {!known && (
          <span
            data-testid="auth-unknown-type"
            // FR-031 — the attributes below are the file's, passed through untouched.
            className="rounded-sm border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            unrecognized type · shown verbatim
          </span>
        )}
      </div>

      {auth.attributes.length === 0 ? (
        <EmptySection what="Auth attributes" />
      ) : (
        <table data-testid="auth-attrs-table" className="w-full border-collapse text-sm">
          <caption className="sr-only">Auth attributes</caption>
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="py-1 pr-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Key
              </th>
              <th
                scope="col"
                colSpan={2}
                className="py-1 pr-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {auth.attributes.map((attr, index) => (
              // Position is part of the identity: a malformed file can repeat a key.
              <AuthAttrRow key={`${attr.key}:${index}`} attr={attr} variables={variables} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * FR-032 / TC-U-077 — reveal is per value *and* per node.
 *
 * `key={nodeId}` is the whole mechanism: selecting a different request remounts the subtree, so
 * every reveal toggle goes back to its masked initial state. Clearing the state in an effect
 * instead would leave one frame in which request B's token is on screen because request A's eye
 * was open, which is exactly the screen-share accident ADR-016 is about.
 */
export function AuthPanel({ auth, nodeId, variables }: AuthPanelProps): ReactElement {
  return <AuthPanelView key={nodeId} auth={auth} variables={variables} />;
}
