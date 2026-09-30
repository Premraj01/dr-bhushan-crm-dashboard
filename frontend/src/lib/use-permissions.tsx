import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { api, getToken } from "./api";
import { getSessionUser, saveSessionUser, type SessionUser } from "./mock-auth";
import { can, type Action, type Module } from "./permissions";

/** The signed-in user, refreshed from the server so role changes apply without signing out. */
export function useSessionUser(): SessionUser {
  const { data } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<SessionUser>("/auth/me"),
    initialData: getSessionUser,
    initialDataUpdatedAt: 0,
    enabled: getToken() !== null,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  useEffect(() => saveSessionUser(data), [data]);
  return data;
}

/** `const canDelete = useCan("patients", "delete")`. */
export function useCan<M extends Module>(module: M, action: Action<M>): boolean {
  return can(useSessionUser(), module, action);
}

/** Renders children only when allowed: `<Can module="billing" action="collect">…</Can>`. */
export function Can<M extends Module>({
  module,
  action,
  children,
  fallback = null,
}: {
  module: M;
  action: Action<M>;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(module, action) ? children : fallback;
}
