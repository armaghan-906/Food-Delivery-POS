/**
 * PIN attempt throttling.
 *
 * A 4-digit PIN has 10,000 combinations. No hash algorithm makes that strong —
 * an attacker with the database can enumerate the entire keyspace in seconds
 * regardless of whether we use scrypt, argon2 or bcrypt. The hash protects
 * against casual disclosure; **lockout is what actually protects the account**.
 *
 * Pure functions over an explicit state value, so this is trivially testable
 * and the same rules apply wherever it runs.
 */

export interface LockoutState {
  failedAttempts: number;
  /** ISO timestamp; null when not locked. */
  lockedUntil: string | null;
}

export const LOCKOUT_POLICY = {
  /** Attempts before the account locks. */
  maxAttempts: 5,
  /** How long a lockout lasts. */
  lockoutSeconds: 300,
} as const;

export const INITIAL_LOCKOUT: LockoutState = { failedAttempts: 0, lockedUntil: null };

export function isLockedOut(state: LockoutState, now: Date): boolean {
  if (!state.lockedUntil) return false;
  return new Date(state.lockedUntil).getTime() > now.getTime();
}

export function secondsRemaining(state: LockoutState, now: Date): number {
  if (!state.lockedUntil) return 0;
  const remaining = new Date(state.lockedUntil).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function recordFailure(state: LockoutState, now: Date): LockoutState {
  const failedAttempts = state.failedAttempts + 1;

  if (failedAttempts >= LOCKOUT_POLICY.maxAttempts) {
    return {
      failedAttempts,
      lockedUntil: new Date(
        now.getTime() + LOCKOUT_POLICY.lockoutSeconds * 1000,
      ).toISOString(),
    };
  }

  return { failedAttempts, lockedUntil: null };
}

/** A correct PIN clears the counter entirely. */
export function recordSuccess(): LockoutState {
  return INITIAL_LOCKOUT;
}

/** Attempts left before lockout. Shown to staff so a lockout is never a surprise. */
export function attemptsRemaining(state: LockoutState): number {
  return Math.max(0, LOCKOUT_POLICY.maxAttempts - state.failedAttempts);
}
