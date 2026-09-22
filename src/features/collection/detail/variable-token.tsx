import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { isVariableDefined, tokenizeVariables, type VariableIndex } from './variables';

/** ux §S2 — the dashed chip's tooltip; the one place this sentence is written. */
export const UNDEFINED_VARIABLE_HINT = 'not defined in this collection';

export interface VariableTokenProps {
  /** Trimmed name, used for the lookup and for tests to target a chip. */
  name: string;
  /** Verbatim source slice — what the chip displays, so `{{ a }}` stays `{{ a }}`. */
  raw: string;
  defined: boolean;
}

/**
 * FR-035 — one `{{variable}}` occurrence.
 *
 * Defined-ness is carried three ways so it is not a colour-only signal: `data-defined` for
 * tests and tooling, a dashed border, and a tooltip naming the problem. The chip's content is
 * a React text child; nothing here can become markup (NFR-010).
 */
export function VariableToken({ name, raw, defined }: VariableTokenProps) {
  return (
    <span
      data-testid="var-chip"
      data-defined={String(defined)}
      data-var={name}
      title={defined ? undefined : UNDEFINED_VARIABLE_HINT}
      className={cn(
        'rounded-[3px] border bg-token-var-bg px-1 font-mono text-[11px] text-token-var',
        defined ? 'border-transparent' : 'border-dashed border-current'
      )}
    >
      {raw}
    </span>
  );
}

export interface VariableTextProps {
  /** A string straight out of the collection file. */
  text: string;
  variables: VariableIndex;
}

/**
 * A collection string with its `{{variables}}` promoted to chips and everything else left as
 * plain text nodes. Returns a fragment — the caller owns the block element and its typography.
 */
export function VariableText({ text, variables }: VariableTextProps) {
  const segments = tokenizeVariables(text);

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'variable' ? (
          <VariableToken
            key={index}
            name={segment.name}
            raw={segment.raw}
            defined={isVariableDefined(variables, segment.name)}
          />
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}
