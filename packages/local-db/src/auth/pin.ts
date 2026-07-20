import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify(scrypt)` collapses to the 3-argument overload and drops the
 * options parameter, so the cost settings below would be silently ignored by
 * the type checker. Wrapping it by hand keeps them typed.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * PIN hashing using Node's built-in scrypt.
 *
 * **Why scrypt and not argon2:** argon2 is marginally stronger, but it is a
 * native module, and this repo already pays a real cost for one of those
 * (better-sqlite3 needs separate Node and Electron builds — see
 * scripts/rebuild-native.mjs). A second native dependency doubles that
 * maintenance surface. scrypt is in Node core, is memory-hard, and is
 * thoroughly adequate here.
 *
 * **Why the algorithm barely matters:** a 4-digit PIN has 10,000 possible
 * values. Anyone holding the database can enumerate the whole keyspace in
 * seconds no matter what we hash with. The hash prevents casual disclosure —
 * a manager glancing at the table, a leaked backup. What actually protects the
 * account is attempt lockout (see @pos/core `lockout.ts`). Do not mistake this
 * function for the security boundary.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Cost parameters, tuned for a till rather than copied from a web-app default.
 *
 * N=16384 (scrypt's usual "interactive" setting) measured ~770ms on this
 * hardware. That is a long pause for a supervisor override during a rush, and
 * given a 10,000-value keyspace the extra work buys almost nothing — an
 * attacker with the database wins either way; lockout is the real defence.
 * N=8192 lands around 380ms: still memory-hard, no longer sluggish.
 *
 * The hash string records these, so raising them later is a migration rather
 * than a breaking change.
 */
const SCRYPT_PARAMS = { N: 8_192, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** Format: scrypt$N$r$p$salt$hash — self-describing so params can change later. */
export async function hashPin(pin: string): Promise<string> {
  assertValidPinFormat(pin);

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(pin, salt, KEY_LENGTH, SCRYPT_PARAMS);

  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verify a PIN against a stored hash.
 *
 * Uses a constant-time comparison. Returns false on any malformed hash rather
 * than throwing, so a corrupt row cannot be distinguished from a wrong PIN by
 * timing or by error message.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');

    const derived = await scryptAsync(pin, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });

    // Length check first — timingSafeEqual throws on mismatched lengths.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export class InvalidPinFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPinFormatError';
  }
}

/**
 * PINs are 4–8 digits. Rejecting the obviously terrible ones is worth the
 * small friction — "1234" and "0000" are what people pick by default, and a
 * till PIN guards the ability to take money.
 */
const BANNED_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1122', '1212', '2580', // 2580 is the centre column of a keypad
]);

export function assertValidPinFormat(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new InvalidPinFormatError('PIN must be 4 to 8 digits');
  }
  if (BANNED_PINS.has(pin)) {
    throw new InvalidPinFormatError('That PIN is too easily guessed — choose another');
  }
}

export function isPinAllowed(pin: string): boolean {
  try {
    assertValidPinFormat(pin);
    return true;
  } catch {
    return false;
  }
}
