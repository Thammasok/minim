/**
 * FR-032 / ADR-016 — masking credential-bearing auth values.
 *
 * ADR-016 is explicit that this is not secrecy: the user opened this file and can read it in any
 * editor. It is about a token not landing in a screen-share or a screenshot by accident. Two
 * consequences follow, and both are deliberate:
 *
 * - The mask is a **fixed** width. Rendering one bullet per character would leak the length of
 *   the secret for free, which is the one thing a mask can leak without anyone noticing.
 * - The masked value is never the real value with a style on top. The caller must not render the
 *   plaintext at all until the user reveals it (TC-U-076 asserts absence from the DOM, not
 *   invisibility).
 */

export const MASK_GLYPH = '•';

/** Matches the twelve-bullet mask in ux-design.md §S2b. */
export const MASK_WIDTH = 12;

/** The constant-width mask. Takes no value on purpose — it cannot leak what it never sees. */
export const MASKED_VALUE = MASK_GLYPH.repeat(MASK_WIDTH);

/**
 * Keys whose value is credential-bearing, from the examples FR-032 names.
 *
 * The backend already sets `AuthAttrView.sensitive` and stays authoritative. This is the second
 * belt: an auth type minim has never heard of (FR-031) arrives verbatim, and a frontend that
 * only trusted the flag would print a `clientSecret` in the clear the day a new type appears.
 * Masking one attribute too many costs a click; masking one too few costs a token.
 */
const SENSITIVE_KEY_PATTERN =
  /pass|token|secret|key|credential|signature|nonce|salt|auth|bearer|session|cookie/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Whether an auth attribute is shown masked before any reveal. */
export function isMaskedAttribute(attr: { key: string; sensitive: boolean }): boolean {
  return attr.sensitive || isSensitiveKey(attr.key);
}
