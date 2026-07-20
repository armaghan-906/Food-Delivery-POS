/**
 * Role-based permissions. Pure — no I/O, no session, just the rules.
 *
 * Kept here rather than in the UI so the same checks apply on the till, in the
 * backend, and in any future tablet or KDS client. A permission enforced only
 * in the renderer is not enforced at all.
 */

export type StaffRole = 'server' | 'supervisor' | 'manager' | 'admin';

export const PERMISSIONS = [
  'order.create',
  'order.void_item_before_payment',
  /** Voiding after payment moves money — deliberately a higher bar. */
  'order.void_item_after_payment',
  'order.cancel',
  'order.discount',
  'payment.take',
  'payment.refund',
  'shift.open',
  'shift.close',
  'shift.cash_movement',
  'report.x_report',
  'report.z_report',
  'staff.manage',
  'menu.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Roles are cumulative: each inherits everything below it.
 *
 * The split that matters is between what a server can do alone and what needs
 * a supervisor. Anything that reduces takings — voids after payment, refunds,
 * discounts — requires supervisor or above, because that is where till fraud
 * happens.
 */
const SERVER: Permission[] = [
  'order.create',
  'order.void_item_before_payment',
  'payment.take',
  'shift.cash_movement',
];

const SUPERVISOR: Permission[] = [
  ...SERVER,
  'order.void_item_after_payment',
  'order.cancel',
  'order.discount',
  'payment.refund',
  'shift.open',
  'shift.close',
  'report.x_report',
];

const MANAGER: Permission[] = [...SUPERVISOR, 'report.z_report', 'menu.manage'];

const ADMIN: Permission[] = [...MANAGER, 'staff.manage'];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  server: SERVER,
  supervisor: SUPERVISOR,
  manager: MANAGER,
  admin: ADMIN,
};

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Does this action need someone more senior to authorise it?
 *
 * Lets a server keep working and call a supervisor over for the one action,
 * rather than logging out and back in mid-service.
 */
export function requiresEscalation(role: StaffRole, permission: Permission): boolean {
  return !can(role, permission);
}
