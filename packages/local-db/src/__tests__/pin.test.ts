import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isPinAllowed, InvalidPinFormatError } from '../auth/pin.js';

describe('hashPin / verifyPin', () => {
  it('verifies a correct PIN', async () => {
    const hash = await hashPin('4829');
    expect(await verifyPin('4829', hash)).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('4829');
    expect(await verifyPin('4830', hash)).toBe(false);
  });

  it('never stores the PIN in the hash string', async () => {
    // The obvious catastrophic bug. Assert it explicitly.
    const hash = await hashPin('4829');
    expect(hash).not.toContain('4829');
  });

  it('salts, so the same PIN hashes differently each time', async () => {
    const a = await hashPin('4829');
    const b = await hashPin('4829');
    expect(a).not.toBe(b);
    // ...but both still verify.
    expect(await verifyPin('4829', a)).toBe(true);
    expect(await verifyPin('4829', b)).toBe(true);
  });

  it('records its parameters so they can be changed later', async () => {
    const hash = await hashPin('4829');
    expect(hash.startsWith('scrypt$8192$8$1$')).toBe(true);
  });

  it('returns false for a malformed hash rather than throwing', async () => {
    // A corrupt row must be indistinguishable from a wrong PIN.
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'bcrypt$16384$8$1$aa$bb']) {
      expect(await verifyPin('4829', bad)).toBe(false);
    }
  });

  it('handles longer PINs', async () => {
    const hash = await hashPin('48291736');
    expect(await verifyPin('48291736', hash)).toBe(true);
    expect(await verifyPin('4829173', hash)).toBe(false);
  });
});

describe('PIN policy', () => {
  it('requires 4 to 8 digits', () => {
    expect(isPinAllowed('482')).toBe(false);
    expect(isPinAllowed('4829')).toBe(true);
    expect(isPinAllowed('482917363')).toBe(false);
  });

  it('rejects non-digits', () => {
    expect(isPinAllowed('48a9')).toBe(false);
    expect(isPinAllowed('    ')).toBe(false);
  });

  it('rejects the PINs people actually pick', () => {
    for (const bad of ['0000', '1234', '1111', '4321', '2580']) {
      expect(isPinAllowed(bad), `${bad} should be banned`).toBe(false);
    }
  });

  it('throws a typed error explaining why', async () => {
    await expect(hashPin('1234')).rejects.toThrow(InvalidPinFormatError);
    await expect(hashPin('12')).rejects.toThrow(/4 to 8 digits/);
  });
});
