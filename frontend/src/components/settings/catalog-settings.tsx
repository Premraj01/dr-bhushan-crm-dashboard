import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  FlaskConical,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  Search,
  Scissors,
  Trash2,
} from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import {
  CONCERN_ILLUSTRATIONS,
  HairLossIllustration,
  ILLUSTRATION_LABELS,
  type ConcernIllustration,
} from "@/components/hair-loss-illustration";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, getToken } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";

export const TREATMENT_CATEGORIES = ["PRP", "Transplant", "Consultation", "Scalp therapy"] as const;
export type TreatmentCategory = (typeof TREATMENT_CATEGORIES)[number];

export type PricingUnit = "session" | "graft";
export type DurationUnit = "minutes" | "hours" | "days";

export type TreatmentOption = {
  id: string;
  name: string;
  category: TreatmentCategory;
  sessions?: number;
  /** Per `pricingUnit`, e.g. ₹20 per graft for FUE. */
  price: number;
  pricingUnit: PricingUnit;
  /** Length in `durationUnit`; with `durationMax` it's a range, e.g. 1–2 days. */
  duration: number;
  durationMax?: number | null;
  durationUnit: DurationUnit;
  /** Surgery: scheduled from the package via Pending bookings (1–3 days, blocks the theatre). */
  surgical?: boolean;
  description?: string;
  active: boolean;
};

export type ConcernOption = {
  id: string;
  name: string;
  description?: string;
  /** Built-in drawing (Norwood stages, alopecia areata); null once cleared. */
  illustration?: ConcernIllustration | null;
  active: boolean;
};

export type Resource = "treatments" | "concerns";
type CatalogItem = { id: string; name: string; active: boolean };

/** Which catalog entry is open in the add/edit dialog (`item` absent = adding). */
export type CatalogEditor =
  | { kind: "treatments"; item?: TreatmentOption | undefined }
  | { kind: "concerns"; item?: ConcernOption | undefined };

const RESOURCE_COPY: Record<Resource, { singular: string; event: string }> = {
  treatments: { singular: "treatment", event: "catalog.treatment" },
  concerns: { singular: "concern", event: "catalog.concern" },
};

export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session isn’t connected to the clinic server. Sign in again with the backend running.";
    if (error.status === 403) return "Only Super Admins can change the catalog.";
    return error.message;
  }
  return "Couldn’t reach the clinic server. Make sure the backend is running.";
}

/* ---------- data ---------- */

export function useCatalog<T extends CatalogItem>(resource: Resource) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["catalog", resource],
    queryFn: () => api<T[]>(`/catalog/${resource}`),
    retry: 1,
  });

  // Keep every open Settings screen in sync when anyone changes the catalog.
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["catalog", resource] });
    void queryClient.invalidateQueries({ queryKey: ["quote"] });
  }, [queryClient, resource]);
  const live = getToken() !== null;
  const { event } = RESOURCE_COPY[resource];
  useSocketEvent(`${event}.created`, refresh, live);
  useSocketEvent(`${event}.updated`, refresh, live);
  useSocketEvent(`${event}.deleted`, refresh, live);

  return query;
}

function useCatalogMutations<T extends CatalogItem>(resource: Resource) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ["catalog", resource] });
    // Plan previews are priced from the catalog.
    void queryClient.invalidateQueries({ queryKey: ["quote"] });
  };

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: Partial<Omit<T, "id">> }) =>
      api<T>(id ? `/catalog/${resource}/${id}` : `/catalog/${resource}`, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/catalog/${resource}/${id}`, { method: "DELETE" }),
    onSuccess,
  });
  return { save, remove };
}

/* ---------- list panels ---------- */

type PanelProps<T> = {
  isAdmin: boolean;
  onEdit: (item: T) => void;
  onNotice: (message: string) => void;
};

export function TreatmentCatalogPanel(props: PanelProps<TreatmentOption>) {
  return (
    <CatalogPanel<TreatmentOption>
      {...props}
      resource="treatments"
      title="Treatments"
      subtitle="Services offered, default sessions and pricing"
      icon={FlaskConical}
      emptyHint="Add the procedures and packages your clinic offers."
      meta={(t) =>
        [
          t.category,
          t.pricingUnit === "graft"
            ? "priced per graft"
            : t.sessions
              ? `${t.sessions} session${t.sessions > 1 ? "s" : ""}`
              : null,
          formatDuration(t),
        ]
          .filter(Boolean)
          .join(" · ")
      }
      badge={(t) => t.surgical && <SurgicalTag />}
      trailing={(t) => (
        <span className="catalog-price">
          {inr.format(t.price)}
          {t.pricingUnit === "graft" && <small> / graft</small>}
        </span>
      )}
    />
  );
}

/** Marks a treatment tagged surgical in Settings (an icon; the label is for tooltips and screen readers). */
export function SurgicalTag() {
  return (
    <span
      className="surgical-tag"
      role="img"
      aria-label="Surgical"
      title="Surgical — scheduled via Pending bookings"
    >
      <Scissors aria-hidden />
    </span>
  );
}

export function ConcernCatalogPanel(props: PanelProps<ConcernOption>) {
  return (
    <CatalogPanel<ConcernOption>
      {...props}
      resource="concerns"
      title="Concerns"
      subtitle="Presenting concerns used on patient records"
      icon={ClipboardList}
      emptyHint="Add the hair and scalp concerns patients come in with."
      meta={(c) => c.description ?? "No description"}
      card={{
        group: (c) =>
          !c.illustration
            ? null
            : c.illustration.startsWith("norwood")
              ? "Norwood scale · male pattern hair loss"
              : "Other patterns",
        rank: (c) =>
          c.illustration ? CONCERN_ILLUSTRATIONS.indexOf(c.illustration) : Number.MAX_SAFE_INTEGER,
        art: (c) => (c.illustration ? <HairLossIllustration kind={c.illustration} /> : null),
        listTitle: "Other concerns",
      }}
    />
  );
}

function CatalogPanel<T extends CatalogItem>({
  resource,
  title,
  subtitle,
  icon: Icon,
  emptyHint,
  meta,
  trailing,
  card,
  badge,
  isAdmin,
  onEdit,
  onNotice,
}: PanelProps<T> & {
  resource: Resource;
  title: string;
  subtitle: string;
  icon: typeof FlaskConical;
  emptyHint: string;
  meta: (item: T) => string;
  trailing?: (item: T) => ReactNode;
  /** Shown right after the name, e.g. the surgical icon. */
  badge?: (item: T) => ReactNode;
  /** Render items that belong to a group as illustrated cards instead of list rows. */
  card?: {
    group: (item: T) => string | null;
    /** Sort key for cards; groups appear in the order of their first card. */
    rank: (item: T) => number;
    art: (item: T) => ReactNode;
    listTitle: string;
  };
}) {
  const { data, isPending, isError, error, refetch, isRefetching } = useCatalog<T>(resource);
  const { save, remove } = useCatalogMutations<T>(resource);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { singular } = RESOURCE_COPY[resource];

  const q = search.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (item) => !q || `${item.name} ${meta(item)}`.toLowerCase().includes(q),
  );
  const activeCount = (data ?? []).filter((item) => item.active).length;

  // Preserve catalog order within each card group (e.g. Stage 1 → Stage 7).
  const groups = new Map<string, T[]>();
  const listRows: T[] = [];
  const ordered = card ? [...rows].sort((a, b) => card.rank(a) - card.rank(b)) : rows;
  for (const item of ordered) {
    const group = card?.group(item);
    if (group) groups.set(group, [...(groups.get(group) ?? []), item]);
    else listRows.push(item);
  }

  const itemMenu = (item: T) =>
    isAdmin && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(item)}>
            <Pencil />
            Edit {singular}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggle(item)}>
            <Power />
            {item.active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setPendingDelete(item)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const toggle = (item: T) => {
    setActionError(null);
    save.mutate(
      { id: item.id, body: { active: !item.active } as Partial<Omit<T, "id">> },
      {
        onSuccess: () => onNotice(`“${item.name}” ${item.active ? "deactivated" : "activated"}.`),
        onError: (err) => setActionError(errorMessage(err)),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setActionError(null);
    remove.mutate(item.id, {
      onSuccess: () => onNotice(`“${item.name}” removed from ${title.toLowerCase()}.`),
      onError: (err) => setActionError(errorMessage(err)),
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <section className="panel">
      <SectionHeader
        title={title}
        subtitle={data ? `${subtitle} · ${activeCount} active of ${data.length}` : subtitle}
        trailing={
          <label className="field-search catalog-search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              aria-label={`Search ${title.toLowerCase()}`}
            />
          </label>
        }
      />
      <div className="catalog-body">
        {!isAdmin && (
          <Banner tone="warning">
            You can view the {title.toLowerCase()} catalog. Only Super Admins can add or change
            entries.
          </Banner>
        )}
        {actionError && (
          <Banner tone="error" onClose={() => setActionError(null)}>
            {actionError}
          </Banner>
        )}

        {isPending ? (
          <div className="catalog-list" aria-label={`Loading ${title.toLowerCase()}`}>
            {Array.from({ length: 4 }, (_, i) => (
              <div className="catalog-row" key={i}>
                <Skeleton className="size-9" />
                <div>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="catalog-error">
            <Banner tone="error">{errorMessage(error)}</Banner>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {q ? <Search /> : <Icon />}
            <h3>
              {q ? `No ${title.toLowerCase()} match “${search}”` : `No ${title.toLowerCase()} yet`}
            </h3>
            <p>{q ? "Try a different name." : emptyHint}</p>
          </div>
        ) : (
          <>
            {[...groups].map(([group, items]) => (
              <div className="catalog-group" key={group}>
                <h3>{group}</h3>
                <div className="catalog-cards">
                  {items.map((item) => (
                    <article
                      className={`catalog-card${item.active ? "" : " inactive"}`}
                      key={item.id}
                    >
                      <div className="catalog-card-art">{card?.art(item)}</div>
                      <div className="catalog-card-body">
                        <strong>{item.name}</strong>
                        <small>{meta(item)}</small>
                      </div>
                      <div className="catalog-card-foot">
                        <StatusChip tone={item.active ? "success" : "neutral"}>
                          {item.active ? "Active" : "Inactive"}
                        </StatusChip>
                        {itemMenu(item)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
            {listRows.length > 0 && (
              <div className="catalog-group">
                {groups.size > 0 && card && <h3>{card.listTitle}</h3>}
                <div className="catalog-list">
                  {listRows.map((item) => (
                    <div className={`catalog-row${item.active ? "" : " inactive"}`} key={item.id}>
                      <span className="catalog-icon">
                        <Icon />
                      </span>
                      <div className="min-w-0">
                        <strong className="catalog-name">
                          {item.name}
                          {badge?.(item)}
                        </strong>
                        <small>{meta(item)}</small>
                      </div>
                      {trailing?.(item)}
                      <StatusChip tone={item.active ? "success" : "neutral"}>
                        {item.active ? "Active" : "Inactive"}
                      </StatusChip>
                      {itemMenu(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !remove.isPending && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be available to pick. Existing patient records keep their current
              value. To hide it temporarily, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {remove.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const UNIT_LABEL: Record<DurationUnit, [string, string]> = {
  minutes: ["min", "min"],
  hours: ["hour", "hours"],
  days: ["day", "days"],
};

/** "45 min", "2 hours", "1–2 days". */
function formatDuration({ duration, durationMax, durationUnit }: TreatmentOption): string {
  const [one, many] = UNIT_LABEL[durationUnit];
  const upper = durationMax ?? duration;
  return `${durationMax ? `${duration}–${durationMax}` : duration} ${upper === 1 ? one : many}`;
}

/* ---------- add / edit dialog ---------- */

export function CatalogDialog({
  editor,
  onOpenChange,
  onNotice,
}: {
  editor: CatalogEditor | null;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <Dialog open={editor !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {editor?.kind === "treatments" && (
          <TreatmentForm
            item={editor.item}
            onDone={(msg) => {
              onOpenChange(false);
              onNotice(msg);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
        {editor?.kind === "concerns" && (
          <ConcernForm
            item={editor.item}
            onDone={(msg) => {
              onOpenChange(false);
              onNotice(msg);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormProps<T> = {
  item?: T | undefined;
  onDone: (message: string) => void;
  onCancel: () => void;
};

function TreatmentForm({ item, onDone, onCancel }: FormProps<TreatmentOption>) {
  const { save } = useCatalogMutations<TreatmentOption>("treatments");
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<TreatmentCategory>(item?.category ?? "PRP");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(item?.pricingUnit ?? "session");
  const [sessions, setSessions] = useState(item?.sessions ? String(item.sessions) : "1");
  const [duration, setDuration] = useState(item ? String(item.duration) : "45");
  const [durationMax, setDurationMax] = useState(item?.durationMax ? String(item.durationMax) : "");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(item?.durationUnit ?? "minutes");
  const rangeInvalid = durationMax !== "" && Number(durationMax) <= Number(duration);
  const [description, setDescription] = useState(item?.description ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [surgical, setSurgical] = useState(item?.surgical ?? false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rangeInvalid) return;
    save.mutate(
      {
        id: item?.id,
        body: {
          name: name.trim(),
          category,
          price: Number(price),
          pricingUnit,
          ...(sessions && { sessions: Number(sessions) }),
          duration: Number(duration),
          // null clears a previous range when the "up to" field is emptied.
          durationMax: durationMax ? Number(durationMax) : null,
          durationUnit,
          surgical,
          ...(description.trim() && { description: description.trim() }),
          active,
        },
      },
      {
        onSuccess: (saved) =>
          onDone(item ? `“${saved.name}” updated.` : `“${saved.name}” added to treatments.`),
      },
    );
  };

  return (
    <CatalogFormShell
      title={item ? "Edit treatment" : "Add treatment"}
      description="Treatments appear when booking appointments, recording sessions and creating invoices."
      submitLabel={item ? "Save changes" : "Add treatment"}
      pending={save.isPending}
      error={save.isError ? errorMessage(save.error) : null}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="full">
        Treatment name
        <input
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. PRP session"
        />
      </label>
      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value as TreatmentCategory)}>
          {TREATMENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Priced per
        <select value={pricingUnit} onChange={(e) => setPricingUnit(e.target.value as PricingUnit)}>
          <option value="session">Session</option>
          <option value="graft">Graft (FUE)</option>
        </select>
      </label>
      <label>
        {pricingUnit === "graft" ? "Price per graft (₹)" : "Price per session (₹)"}
        <input
          required
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={pricingUnit === "graft" ? "20" : "4500"}
        />
      </label>
      <label>
        Sessions included
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          step={1}
          value={sessions}
          onChange={(e) => setSessions(e.target.value)}
        />
      </label>
      <fieldset className="full duration-field">
        <legend>Duration</legend>
        <label>
          From
          <input
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            step={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <label>
          Up to (optional)
          <input
            type="number"
            inputMode="numeric"
            min={Number(duration) + 1 || 2}
            max={720}
            step={1}
            value={durationMax}
            onChange={(e) => setDurationMax(e.target.value)}
            placeholder="For a range"
            aria-invalid={rangeInvalid}
          />
        </label>
        <label>
          Unit
          <select
            value={durationUnit}
            onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </label>
        {rangeInvalid && <p className="field-hint">“Up to” must be more than “From”.</p>}
      </fieldset>
      <label className="full">
        Description
        <textarea
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional — what’s included, graft limits, etc."
        />
      </label>
      <div className="full form-switch">
        <div>
          <strong>Surgical procedure</strong>
          <small>
            Scheduled from the package via Pending bookings, takes 1–3 days and blocks the theatre.
            Other treatments are booked as normal visits.
          </small>
        </div>
        <Switch checked={surgical} onCheckedChange={setSurgical} aria-label="Surgical procedure" />
      </div>
      <ActiveSwitch checked={active} onChange={setActive} />
    </CatalogFormShell>
  );
}

function ConcernForm({ item, onDone, onCancel }: FormProps<ConcernOption>) {
  const { save } = useCatalogMutations<ConcernOption>("concerns");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [illustration, setIllustration] = useState<ConcernIllustration | "">(
    item?.illustration ?? "",
  );
  const [active, setActive] = useState(item?.active ?? true);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        id: item?.id,
        body: {
          name: name.trim(),
          ...(description.trim() && { description: description.trim() }),
          // null clears a previously chosen drawing when editing.
          illustration: illustration || null,
          active,
        },
      },
      {
        onSuccess: (saved) =>
          onDone(item ? `“${saved.name}” updated.` : `“${saved.name}” added to concerns.`),
      },
    );
  };

  return (
    <CatalogFormShell
      title={item ? "Edit concern" : "Add concern"}
      description="Concerns are the presenting problems you record on a patient’s profile."
      submitLabel={item ? "Save changes" : "Add concern"}
      pending={save.isPending}
      error={save.isError ? errorMessage(save.error) : null}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="full">
        Concern name
        <input
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Receding hairline"
        />
      </label>
      <label className="full">
        Description
        <textarea
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional — clinical notes or grading, e.g. Norwood stage"
        />
      </label>
      <div className="full illustration-field">
        <label>
          Illustration
          <select
            value={illustration}
            onChange={(e) => setIllustration(e.target.value as ConcernIllustration | "")}
          >
            <option value="">None — show in the concerns list</option>
            {CONCERN_ILLUSTRATIONS.map((kind) => (
              <option key={kind} value={kind}>
                {ILLUSTRATION_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <div className="illustration-preview" aria-hidden={!illustration}>
          {illustration ? <HairLossIllustration kind={illustration} /> : <span>No drawing</span>}
        </div>
      </div>
      <ActiveSwitch checked={active} onChange={setActive} />
    </CatalogFormShell>
  );
}

function ActiveSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="full form-switch">
      <div>
        <strong>Active</strong>
        <small>Inactive entries stay on existing records but can’t be picked for new ones.</small>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label="Active" />
    </div>
  );
}

function CatalogFormShell({
  title,
  description,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  // Move focus to the error so keyboard and screen-reader users notice it.
  const [errorEl, setErrorEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (error) errorEl?.focus();
  }, [error, errorEl]);

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {error && (
        <div ref={setErrorEl} tabIndex={-1} className="mt-4 outline-none">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="form-grid mt-4">{children}</div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
