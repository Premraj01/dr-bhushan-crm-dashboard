import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Lock, RotateCcw, Save } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorText } from "@/lib/api";
import { ROLE_LABELS, type Role } from "@/lib/mock-auth";
import { ACTION_LABELS, MODULE_LABELS, type Module, type Permission } from "@/lib/permissions";
import { useCan } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";

type RoleAccess = { role: Role; permissions: Permission[]; locked: boolean };
type RolesResponse = { modules: Record<Module, string[]>; roles: RoleAccess[] };

export const ROLES_QUERY_KEY = ["roles"];

/**
 * Settings → Roles & permissions: tick what each role may do in every module.
 * Saving applies at once — the server enforces it and signed-in members' screens update live.
 */
export function RolesSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const canManage = useCan("team", "manageRoles");
  const client = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => api<RolesResponse>("/roles"),
  });
  const [selected, setSelected] = useState<Role>("Doctor");
  // Unsaved edits per role; roles without one show what the server has.
  const [drafts, setDrafts] = useState<Partial<Record<Role, Set<string>>>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const save = useMutation({
    mutationFn: ({ role, permissions }: { role: Role; permissions: string[] }) =>
      api<RoleAccess>(`/roles/${role}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      }),
    onSuccess: (saved) => {
      setDrafts(({ [saved.role]: _saved, ...rest }) => rest);
      void client.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      void client.invalidateQueries({ queryKey: ["auth", "me"] });
      const text = `${ROLE_LABELS[saved.role]} access saved. It applies to their next action.`;
      setMessage({ tone: "success", text });
      onNotice(text);
    },
    onError: (err) => setMessage({ tone: "error", text: errorText(err) }),
  });

  if (isPending)
    return (
      <section className="panel roles-panel">
        <SectionHeader title="Roles & permissions" />
        <div className="roles-body">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </section>
    );
  if (isError)
    return (
      <section className="panel roles-panel">
        <SectionHeader title="Roles & permissions" />
        <div className="roles-body">
          <Banner tone="error">{errorText(error)}</Banner>
        </div>
      </section>
    );

  const saved = new Map(data.roles.map((r) => [r.role, new Set<string>(r.permissions)]));
  const access = data.roles.find((r) => r.role === selected) ?? data.roles[0];
  if (!access) return null;
  const granted = drafts[access.role] ?? saved.get(access.role) ?? new Set<string>();
  const serverSet = saved.get(access.role) ?? new Set<string>();
  const dirty = granted.size !== serverSet.size || [...granted].some((p) => !serverSet.has(p));
  const readOnly = access.locked || !canManage;
  const total = Object.values(data.modules).reduce((n, actions) => n + actions.length, 0);

  const update = (next: Set<string>) => {
    setMessage(null);
    setDrafts((d) => ({ ...d, [access.role]: next }));
  };
  // "View" underpins a module: turning it off clears the rest, any other action turns it on.
  const toggle = (module: Module, action: string) => {
    const next = new Set(granted);
    const key = `${module}.${action}`;
    if (next.has(key)) {
      next.delete(key);
      if (action === "view") for (const a of data.modules[module]) next.delete(`${module}.${a}`);
    } else {
      next.add(key);
      next.add(`${module}.view`);
    }
    update(next);
  };
  const toggleModule = (module: Module, on: boolean) => {
    const next = new Set(granted);
    for (const a of data.modules[module]) {
      if (on) next.add(`${module}.${a}`);
      else next.delete(`${module}.${a}`);
    }
    update(next);
  };

  return (
    <section className="panel roles-panel">
      <SectionHeader
        title="Roles & permissions"
        subtitle="Choose what each role can see and do. Changes apply as soon as you save."
        trailing={dirty ? <StatusChip tone="warning">Unsaved changes</StatusChip> : undefined}
      />
      <div className="roles-body">
        {message && (
          <Banner tone={message.tone} onClose={() => setMessage(null)}>
            {message.text}
          </Banner>
        )}

        <div className="role-picker" role="tablist" aria-label="Roles">
          {data.roles.map((r) => {
            const count = (drafts[r.role] ?? saved.get(r.role))?.size ?? 0;
            return (
              <button
                key={r.role}
                type="button"
                role="tab"
                aria-selected={r.role === access.role}
                className={cn(r.role === access.role && "active")}
                onClick={() => setSelected(r.role)}
              >
                <strong>
                  {ROLE_LABELS[r.role]}
                  {r.locked && <Lock aria-label="Locked" />}
                  {drafts[r.role] && <span className="role-dirty" aria-label="Unsaved" />}
                </strong>
                <small>
                  {count} of {total} actions
                </small>
              </button>
            );
          })}
        </div>

        {access.locked ? (
          <Banner tone="info">
            Super Admin always has full access, so the clinic can never be locked out.
          </Banner>
        ) : (
          !canManage && (
            <Banner tone="info">
              You can see each role’s access, but only a Super Admin can change it.
            </Banner>
          )
        )}

        <div
          className="perm-list"
          role="tabpanel"
          aria-label={`${ROLE_LABELS[access.role]} access`}
        >
          {(Object.keys(data.modules) as Module[]).map((module) => {
            const actions = data.modules[module];
            const on = actions.filter((a) => granted.has(`${module}.${a}`)).length;
            const { label, hint } = MODULE_LABELS[module] ?? { label: module, hint: "" };
            return (
              <div className={cn("perm-row", on === 0 && "is-off")} key={module}>
                <div className="perm-module">
                  <strong>{label}</strong>
                  <span>{on === 0 ? "No access" : hint}</span>
                </div>
                <div className="perm-actions" role="group" aria-label={`${label} actions`}>
                  {actions.map((action) => {
                    const active = granted.has(`${module}.${action}`);
                    return (
                      <button
                        key={action}
                        type="button"
                        className="perm-chip"
                        aria-pressed={active}
                        disabled={readOnly}
                        onClick={() => toggle(module, action)}
                      >
                        {active && <Check />}
                        {ACTION_LABELS[action] ?? action}
                      </button>
                    );
                  })}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="perm-all"
                    onClick={() => toggleModule(module, on < actions.length)}
                  >
                    {on < actions.length ? "Allow all" : "Remove all"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!readOnly && (
          <div className="roles-footer">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => setDrafts(({ [access.role]: _discarded, ...rest }) => rest)}
            >
              <RotateCcw />
              Discard changes
            </Button>
            <Button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate({ role: access.role, permissions: [...granted] })}
            >
              {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              Save {ROLE_LABELS[access.role]} access
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
