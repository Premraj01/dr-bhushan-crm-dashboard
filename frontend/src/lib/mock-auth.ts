import { api, ApiError, setToken } from "./api";
import { ALL_PERMISSIONS, type Permission } from "./permissions";
import { disconnectSocket } from "./socket";

const KEY = "drb-auth";
const JUST_LOGGED_IN = "drb-just-logged-in";
const USER_KEY = "drb-user";

export type Role = "SuperAdmin" | "Doctor" | "Nurse" | "Receptionist";

export type SessionUser = {
  name: string;
  email: string;
  role: Role;
  title?: string;
  /** What this role may do, from the server — check with `can()` / `useCan()` in `permissions.ts`. */
  permissions: Permission[];
};

export const ROLE_LABELS: Record<Role, string> = {
  SuperAdmin: "Super Admin",
  Doctor: "Doctor",
  Nurse: "Nurse",
  Receptionist: "Receptionist",
};

/**
 * Seeded accounts used when the backend isn't reachable (offline demo). There's no
 * server to ask for permissions, and nothing can be saved anyway, so every screen shows.
 */
const offline = (name: string, email: string, role: Role): SessionUser => ({
  name,
  email,
  role,
  permissions: ALL_PERMISSIONS,
});
const OFFLINE_DEMO_USERS: Record<Role, SessionUser> = {
  SuperAdmin: offline("Dr. Bhushan Patil", "admin@drbhushan.clinic", "SuperAdmin"),
  Doctor: offline("Dr. Sonal Desai", "sonal@drbhushan.clinic", "Doctor"),
  Nurse: offline("Meera Jadhav", "meera@drbhushan.clinic", "Nurse"),
  Receptionist: offline("Priya More", "priya@drbhushan.clinic", "Receptionist"),
};

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

function startSession(user: SessionUser) {
  localStorage.setItem(KEY, "1");
  localStorage.setItem(JUST_LOGGED_IN, "1");
  saveSessionUser(user);
}

export function saveSessionUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function mockSignIn(name?: string) {
  startSession({ ...OFFLINE_DEMO_USERS.SuperAdmin, ...(name && { name }) });
}

/**
 * One-click sign-in as a seeded role via the backend's POST /api/auth/demo.
 * Falls back to an offline demo session when the API isn't running, so the
 * prototype stays usable without the backend.
 */
export async function demoSignIn(role: Role): Promise<SessionUser> {
  try {
    const res = await api<{ accessToken: string; user: SessionUser }>("/auth/demo", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
    setToken(res.accessToken);
    startSession(res.user);
    return res.user;
  } catch (error) {
    // 4xx means the API answered and refused (e.g. demo logins disabled) — surface it.
    if (error instanceof ApiError && error.status < 500) throw error;
    console.warn("Backend unreachable, using offline demo session", error);
    setToken(null);
    startSession(OFFLINE_DEMO_USERS[role]);
    return OFFLINE_DEMO_USERS[role];
  }
}

export function getSessionUser(): SessionUser {
  try {
    const raw = localStorage.getItem(USER_KEY);
    // Sessions saved before permissions existed have none until /auth/me refreshes them.
    if (raw) return { permissions: [], ...(JSON.parse(raw) as Omit<SessionUser, "permissions">) };
  } catch {
    // fall through to the default demo user
  }
  return OFFLINE_DEMO_USERS.SuperAdmin;
}

export function mockSignOut() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(JUST_LOGGED_IN);
  localStorage.removeItem(USER_KEY);
  setToken(null);
  disconnectSocket();
}

export function consumeJustLoggedIn(): boolean {
  if (localStorage.getItem(JUST_LOGGED_IN) !== "1") return false;
  localStorage.removeItem(JUST_LOGGED_IN);
  return true;
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** "Dr. Sonal Desai" → "Dr. Sonal", "Priya More" → "Priya". */
export function greetingName(name: string): string {
  const parts = name.split(/\s+/);
  return /^Dr\.?$/i.test(parts[0] ?? "") ? parts.slice(0, 2).join(" ") : (parts[0] ?? name);
}
