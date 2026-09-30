import { ForbiddenException } from '@nestjs/common';
import type { Role } from '../users/user.entity';

/**
 * Every module of the CRM and the actions that can be granted on it.
 * Add a module or action here first; TypeScript then checks every grant and
 * `@RequirePermission()` against this list.
 *
 * The frontend mirrors the names in `frontend/src/lib/permissions.ts` — keep them in sync.
 */
export const PERMISSIONS = {
  dashboard: ['view'],
  patients: ['view', 'create', 'update', 'delete'],
  /** Medical baseline and hair assessment. */
  history: ['view', 'update'],
  prescriptions: ['view', 'create', 'stop'],
  photos: ['view', 'upload', 'delete'],
  documents: ['view', 'upload', 'revoke', 'delete'],
  appointments: ['view', 'create', 'update', 'delete', 'checkIn', 'complete'],
  packages: ['view', 'create', 'update', 'book', 'recordGrafts'],
  plans: ['view', 'create', 'update', 'delete'],
  /** Invoices, payments and EMI plans. */
  billing: ['view', 'create', 'update', 'delete', 'collect'],
  inventory: ['view', 'create', 'update', 'adjustStock', 'delete'],
  leads: ['view', 'create', 'update', 'delete'],
  treatments: ['view', 'create', 'update', 'delete'],
  /** Settings → Treatments / Concerns. */
  catalog: ['view', 'manage'],
  /** `manageRoles`: change what each role may do (Settings → Roles & permissions). */
  team: ['view', 'invite', 'manageRoles'],
  reminders: ['view'],
  reports: ['view'],
} as const satisfies Record<string, readonly string[]>;

export type Module = keyof typeof PERMISSIONS;
export type Action<M extends Module = Module> = (typeof PERMISSIONS)[M][number];
/** e.g. `"patients.delete"`. */
export type Permission = { [M in Module]: `${M}.${Action<M>}` }[Module];

/** Per module: `'*'` for every action, or the list of allowed actions. */
export type Grants = { [M in Module]?: '*' | readonly Action<M>[] };

/** Builds a permission set from grants; `'*'` grants every action of every module. */
export function grant(grants: Grants | '*'): ReadonlySet<Permission> {
  const set = new Set<Permission>();
  for (const module of Object.keys(PERMISSIONS) as Module[]) {
    const allowed = grants === '*' ? '*' : grants[module];
    if (!allowed) continue;
    const actions: readonly string[] =
      allowed === '*' ? PERMISSIONS[module] : allowed;
    for (const action of actions) set.add(`${module}.${action}` as Permission);
  }
  return set;
}

/**
 * Each role's access when the server starts. A Super Admin can change it at runtime in
 * Settings → Roles & permissions (`setRolePermissions`); like all data, that resets on restart.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SuperAdmin: grant('*'),

  Doctor: grant({
    dashboard: '*',
    patients: ['view', 'create', 'update'],
    history: '*',
    prescriptions: '*',
    photos: ['view', 'upload'],
    documents: ['view', 'upload', 'revoke'],
    appointments: ['view', 'create', 'update', 'checkIn', 'complete'],
    packages: '*',
    plans: '*',
    billing: ['view', 'create', 'update', 'collect'],
    inventory: ['view', 'create', 'update', 'adjustStock'],
    leads: ['view', 'create', 'update'],
    treatments: ['view', 'create', 'update'],
    catalog: ['view'],
    team: ['view'],
    reminders: '*',
    reports: '*',
  }),

  Nurse: grant({
    dashboard: '*',
    patients: ['view', 'update'],
    history: ['view'],
    prescriptions: ['view'],
    photos: ['view', 'upload'],
    documents: ['view', 'upload'],
    appointments: ['view', 'checkIn'],
    packages: ['view', 'recordGrafts'],
    plans: ['view'],
    inventory: ['view', 'adjustStock'],
    treatments: ['view', 'create', 'update'],
    catalog: ['view'],
    team: ['view'],
    reminders: '*',
  }),

  Receptionist: grant({
    dashboard: '*',
    patients: ['view', 'create', 'update'],
    history: ['view'],
    prescriptions: ['view'],
    photos: ['view', 'upload'],
    documents: ['view', 'upload', 'revoke'],
    appointments: ['view', 'create', 'update', 'checkIn'],
    packages: ['view', 'book'],
    plans: ['view', 'create', 'update', 'delete'],
    billing: ['view', 'create', 'update', 'collect'],
    inventory: ['view', 'create', 'update', 'adjustStock'],
    leads: ['view', 'create', 'update'],
    treatments: ['view'],
    catalog: ['view'],
    team: ['view'],
    reminders: '*',
  }),
};

/** Super Admin always keeps every permission, so nobody can lock the clinic out. */
export const LOCKED_ROLES: readonly Role[] = ['SuperAdmin'];

export const ALL_PERMISSIONS: readonly Permission[] = [...grant('*')];

const current = new Map<Role, ReadonlySet<Permission>>(
  Object.entries(DEFAULT_ROLE_PERMISSIONS) as [Role, ReadonlySet<Permission>][],
);

/** Replaces a role's permissions; unknown names are dropped. Returns what was stored. */
export function setRolePermissions(
  role: Role,
  permissions: readonly string[],
): Permission[] {
  if (LOCKED_ROLES.includes(role))
    throw new ForbiddenException('Super Admin always has full access');
  const allowed = new Set<string>(ALL_PERMISSIONS);
  const next = new Set(
    permissions.filter((p): p is Permission => allowed.has(p)),
  );
  current.set(role, next);
  return [...next];
}

type Subject = Role | { role: Role } | null | undefined;

/** Everything a role may do, e.g. for the `permissions` sent to the frontend. */
export function permissionsOf(subject: Subject): Permission[] {
  const role = typeof subject === 'string' ? subject : subject?.role;
  return role ? [...(current.get(role) ?? [])] : [];
}

/** `can(user, 'patients', 'delete')` — works with a user or a bare role. */
export function can<M extends Module>(
  subject: Subject,
  module: M,
  action: Action<M>,
): boolean {
  const role = typeof subject === 'string' ? subject : subject?.role;
  return (
    !!role && !!current.get(role)?.has(`${module}.${action}` as Permission)
  );
}

/** Throws 403 unless allowed — for checks that depend on data, inside services. */
export function assertCan<M extends Module>(
  subject: Subject,
  module: M,
  action: Action<M>,
): void {
  if (!can(subject, module, action))
    throw new ForbiddenException(
      `You don’t have permission to ${action} ${module}`,
    );
}
