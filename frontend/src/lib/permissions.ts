import type { SessionUser } from "./mock-auth";

/**
 * Module → actions, mirroring `backend/src/auth/permissions.ts` (keep the names in sync).
 * Which role gets what is decided only by the backend; the signed-in user's grants
 * arrive as `user.permissions` from login and `GET /api/auth/me`.
 * In components use `useCan()` / `<Can>` from `use-permissions.tsx`.
 */
export const PERMISSIONS = {
  dashboard: ["view"],
  patients: ["view", "create", "update", "delete"],
  history: ["view", "update"],
  prescriptions: ["view", "create", "stop"],
  photos: ["view", "upload", "delete"],
  documents: ["view", "upload", "revoke", "delete"],
  appointments: ["view", "create", "update", "delete", "checkIn", "complete"],
  packages: ["view", "create", "update", "book", "recordGrafts"],
  plans: ["view", "create", "update", "delete"],
  billing: ["view", "create", "update", "delete", "collect"],
  inventory: ["view", "create", "update", "adjustStock", "delete"],
  leads: ["view", "create", "update", "delete"],
  treatments: ["view", "create", "update", "delete"],
  catalog: ["view", "manage"],
  team: ["view", "invite", "manageRoles"],
  reminders: ["view"],
  reports: ["view"],
} as const;

export type Module = keyof typeof PERMISSIONS;
export type Action<M extends Module = Module> = (typeof PERMISSIONS)[M][number];
export type Permission = { [M in Module]: `${M}.${Action<M>}` }[Module];

/** How modules read in Settings → Roles & permissions. */
export const MODULE_LABELS: Record<Module, { label: string; hint: string }> = {
  dashboard: { label: "Dashboard", hint: "Today’s schedule and clinic metrics" },
  patients: { label: "Patients", hint: "Patient records and registration" },
  history: { label: "Medical history", hint: "Medical baseline and hair assessment" },
  prescriptions: { label: "Prescriptions", hint: "Medicines prescribed to patients" },
  photos: { label: "Photos", hint: "Clinical photos and before & after" },
  documents: { label: "Consents & documents", hint: "Signed consents and clearances" },
  appointments: { label: "Appointments", hint: "Calendar, check-in and visit completion" },
  packages: { label: "Treatment packages", hint: "Plans applied to a patient and their sessions" },
  plans: { label: "Treatment plans", hint: "Reusable plan templates in Settings" },
  billing: { label: "Billing", hint: "Invoices, payments and EMI" },
  inventory: { label: "Inventory", hint: "Clinic stock of medicines and products" },
  leads: { label: "Leads", hint: "Enquiries and follow-ups" },
  treatments: { label: "Treatments", hint: "Recorded treatments" },
  catalog: { label: "Treatments & concerns catalog", hint: "Prices and options in Settings" },
  team: { label: "Team", hint: "Team members, invitations and role access" },
  reminders: { label: "Reminders", hint: "Patient reminders" },
  reports: { label: "Reports", hint: "Clinic reports and exports" },
};

export const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
  checkIn: "Check in",
  complete: "Complete visit",
  stop: "Stop",
  upload: "Upload",
  revoke: "Withdraw",
  book: "Book sessions",
  recordGrafts: "Record grafts",
  collect: "Receive payments",
  adjustStock: "Adjust stock",
  manage: "Manage",
  invite: "Invite",
  manageRoles: "Manage roles",
};

export const ALL_PERMISSIONS = (Object.keys(PERMISSIONS) as Module[]).flatMap((m) =>
  PERMISSIONS[m].map((a) => `${m}.${a}` as Permission),
);

/** `can(user, "patients", "delete")` — plain function for use outside React. */
export function can<M extends Module>(
  user: Pick<SessionUser, "permissions"> | null | undefined,
  module: M,
  action: Action<M>,
): boolean {
  return !!user?.permissions?.includes(`${module}.${action}` as Permission);
}
