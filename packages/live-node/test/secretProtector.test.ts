import { describe, expect, it } from 'vitest';
import {
  PlaintextAlphaSecretProtector,
  WindowsDpapiSecretProtector,
  createPlatformSecretProtector
} from '../src/secretProtector';

describe('secret protection', () => {
  it('selects the Windows OS protection backend without a native npm addon', () => {
    expect(createPlatformSecretProtector('win32')).toBeInstanceOf(
      WindowsDpapiSecretProtector
    );
    expect(createPlatformSecretProtector('linux')).toBeInstanceOf(
      PlaintextAlphaSecretProtector
    );
  });

  const windowsIt = process.platform === 'win32' ? it : it.skip;

  windowsIt('round-trips a secret with CurrentUser DPAPI without plaintext output at rest', async () => {
    const protector = new WindowsDpapiSecretProtector();
    const secret = 'holyrics-token-with-unicode-ç-🔒';
    const protectedValue = await protector.protect(secret, 'holyrics.token');

    expect(protectedValue).toMatch(/^dpapi:v1:/);
    expect(protectedValue).not.toContain(secret);
    expect(await protector.unprotect(protectedValue, 'holyrics.token')).toBe(secret);
  }, 20_000);
});
