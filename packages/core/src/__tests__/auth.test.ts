import { describe, it, expect } from 'vitest';
import { can, requiresEscalation, ROLE_PERMISSIONS } from '../auth/permissions.js';
import {
  INITIAL_LOCKOUT,
  isLockedOut,
  recordFailure,
  recordSuccess,
  attemptsRemaining,
  secondsRemaining,
  LOCKOUT_POLICY,
} from '../auth/lockout.js';

describe('permissions', () => {
  it('lets a server take orders and payments', () => {
    expect(can('server', 'order.create')).toBe(true);
    expect(can('server', 'payment.take')).toBe(true);
  });

  it('stops a server doing anything that reduces takings', () => {
    // This is where till fraud happens — it needs a second person.
    expect(can('server', 'payment.refund')).toBe(false);
    expect(can('server', 'order.discount')).toBe(false);
    expect(can('server', 'order.void_item_after_payment')).toBe(false);
  });

  it('separates voiding before and after payment', () => {
    // Before payment is routine; after payment moves money.
    expect(can('server', 'order.void_item_before_payment')).toBe(true);
    expect(can('server', 'order.void_item_after_payment')).toBe(false);
    expect(can('supervisor', 'order.void_item_after_payment')).toBe(true);
  });

  it('reserves Z-reports for managers', () => {
    expect(can('supervisor', 'report.x_report')).toBe(true);
    expect(can('supervisor', 'report.z_report')).toBe(false);
    expect(can('manager', 'report.z_report')).toBe(true);
  });

  it('reserves staff management for admins', () => {
    expect(can('manager', 'staff.manage')).toBe(false);
    expect(can('admin', 'staff.manage')).toBe(true);
  });

  it('makes roles strictly cumulative', () => {
    const chain = ['server', 'supervisor', 'manager', 'admin'] as const;
    for (let i = 1; i < chain.length; i++) {
      const lower = ROLE_PERMISSIONS[chain[i - 1]!];
      const higher = ROLE_PERMISSIONS[chain[i]!];
      for (const permission of lower) {
        expect(higher, `${chain[i]} should inherit ${permission}`).toContain(permission);
      }
    }
  });

  it('flags actions needing escalation', () => {
    expect(requiresEscalation('server', 'payment.refund')).toBe(true);
    expect(requiresEscalation('manager', 'payment.refund')).toBe(false);
  });
});

describe('lockout', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('starts unlocked', () => {
    expect(isLockedOut(INITIAL_LOCKOUT, now)).toBe(false);
    expect(attemptsRemaining(INITIAL_LOCKOUT)).toBe(5);
  });

  it('counts failures without locking too early', () => {
    let state = INITIAL_LOCKOUT;
    for (let i = 0; i < LOCKOUT_POLICY.maxAttempts - 1; i++) {
      state = recordFailure(state, now);
      expect(isLockedOut(state, now)).toBe(false);
    }
    expect(attemptsRemaining(state)).toBe(1);
  });

  it('locks on the fifth failure', () => {
    let state = INITIAL_LOCKOUT;
    for (let i = 0; i < LOCKOUT_POLICY.maxAttempts; i++) {
      state = recordFailure(state, now);
    }
    expect(isLockedOut(state, now)).toBe(true);
    expect(attemptsRemaining(state)).toBe(0);
    expect(secondsRemaining(state, now)).toBe(300);
  });

  it('expires the lockout after the window', () => {
    let state = INITIAL_LOCKOUT;
    for (let i = 0; i < LOCKOUT_POLICY.maxAttempts; i++) {
      state = recordFailure(state, now);
    }
    const later = new Date(now.getTime() + 301_000);
    expect(isLockedOut(state, later)).toBe(false);
    expect(secondsRemaining(state, later)).toBe(0);
  });

  it('clears the counter on success', () => {
    let state = recordFailure(recordFailure(INITIAL_LOCKOUT, now), now);
    expect(state.failedAttempts).toBe(2);
    state = recordSuccess();
    expect(state).toEqual(INITIAL_LOCKOUT);
  });
});
