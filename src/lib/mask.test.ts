import { describe, expect, it } from 'vitest';
import { MASKED_VALUE, MASK_GLYPH, MASK_WIDTH, isMaskedAttribute, isSensitiveKey } from './mask';

/** FR-032 / ADR-016 — which auth values are masked, and what the mask may say. */

describe('the mask itself', () => {
  it('is a constant width, so it cannot leak the length of the secret', () => {
    expect(MASKED_VALUE).toBe(MASK_GLYPH.repeat(MASK_WIDTH));
    expect(MASKED_VALUE).toHaveLength(MASK_WIDTH);
  });
});

describe('isSensitiveKey', () => {
  it('matches the credential keys FR-032 names, whatever the casing or compounding', () => {
    for (const key of [
      'password',
      'Password',
      'token',
      'accessToken',
      'refresh_token',
      'secret',
      'clientSecret',
      'key',
      'apiKey',
      'consumerSecret',
      'sessionId',
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it('leaves keys that carry no credential alone', () => {
    for (const key of ['username', 'grantType', 'realm', 'region', 'service', 'algorithm', 'in']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe('isMaskedAttribute', () => {
  it("honours the backend's flag even for a key the pattern would not catch", () => {
    expect(isMaskedAttribute({ key: 'realm', sensitive: true })).toBe(true);
  });

  it('masks a credential-shaped key the backend did not flag (FR-031 second belt)', () => {
    expect(isMaskedAttribute({ key: 'clientSecret', sensitive: false })).toBe(true);
  });

  it('leaves an unflagged, non-credential attribute readable', () => {
    expect(isMaskedAttribute({ key: 'username', sensitive: false })).toBe(false);
  });
});
