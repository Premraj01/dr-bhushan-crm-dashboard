const KEY = "drb-auth";
const JUST_LOGGED_IN = "drb-just-logged-in";

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function mockSignIn(name?: string) {
  localStorage.setItem(KEY, "1");
  localStorage.setItem(JUST_LOGGED_IN, "1");
  if (name) localStorage.setItem("drb-user-name", name);
}

export function mockSignOut() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(JUST_LOGGED_IN);
}

export function consumeJustLoggedIn(): boolean {
  if (localStorage.getItem(JUST_LOGGED_IN) !== "1") return false;
  localStorage.removeItem(JUST_LOGGED_IN);
  return true;
}
