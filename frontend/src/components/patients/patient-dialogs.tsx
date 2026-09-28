import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CircleSlash, LoaderCircle, PackagePlus, Pencil } from "lucide-react";
import { Banner, StatusChip, type Tone } from "@/components/crm-ui";
import {
  inr,
  useCatalog,
  type ConcernOption,
  type TreatmentOption,
} from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { initials } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import {
  clinicToday,
  formatDay,
  formatVisit,
  useCreatePackage,
  usePackages,
  usePatient,
  useSetPackageStatus,
  useUpdatePatient,
  type PackageStatus,
  type Patient,
  type TreatmentPackage,
} from "./patients-api";
import { PlanItemsEditor, PlanPreview } from "@/components/plans/plan-editor";
import {
  usePlans,
  useQuote,
  type PackageRequest,
  type PlanItem,
  type StepView,
} from "@/components/plans/plans-api";
import { useDebounced } from "@/lib/use-debounced";

export type EditTab = "details" | "package";

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You don’t have permission to do that.";
    return error.message;
  }
  return "Couldn’t reach the clinic server. Make sure the backend is running.";
}

const PACKAGE_TONE: Record<PackageStatus, Tone> = {
  Accepted: "success",
  Completed: "neutral",
  Cancelled: "error",
};

/* ---------- profile ---------- */

export function PatientProfileDialog({
  patientId,
  canCreatePackages,
  canEditRecord,
  onOpenChange,
  onEdit,
}: {
  patientId: string | null;
  canCreatePackages: boolean;
  /** "Edit patient record" is offered only from the Patients page. */
  canEditRecord: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: string, tab: EditTab) => void;
}) {
  const { data: patient, isPending } = usePatient(patientId);
  const { data: packages } = usePackages(patientId);
  const next = upcomingVisits(packages ?? [])[0];

  return (
    <Dialog open={patientId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="patient-dialog">
        {!patient ? (
          <>
            <DialogHeader>
              <DialogTitle>{isPending ? "Loading patient…" : "Patient not found"}</DialogTitle>
              <DialogDescription>
                {isPending ? "Fetching the latest record." : "This record may have been removed."}
              </DialogDescription>
            </DialogHeader>
            {isPending && <Skeleton className="h-24 w-full" />}
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="profile-heading">
                <span>{initials(patient.name)}</span>
                <div>
                  <DialogTitle>{patient.name}</DialogTitle>
                  <DialogDescription>
                    {[patient.id, patient.age != null && `${patient.age} years`, patient.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="profile-summary">
              <div>
                <span>Primary concern</span>
                <strong>{patient.concern ?? "Not recorded yet"}</strong>
              </div>
              <div>
                <span>Current plan</span>
                <strong>{patient.treatment}</strong>
              </div>
              {next ? (
                <div>
                  <span>Next session</span>
                  <strong>
                    {formatDay(next.date)} · {next.title}
                  </strong>
                </div>
              ) : (
                <div>
                  <span>Last visit</span>
                  <strong>{formatVisit(patient.lastVisit)}</strong>
                </div>
              )}
            </div>
            <TreatmentTimeline patient={patient} packages={packages ?? []} />
            <PackageList
              patientId={patient.id}
              canManage={canCreatePackages}
              onCreate={() => onEdit(patient.id, "package")}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {canEditRecord && (
                <Button onClick={() => onEdit(patient.id, "details")}>
                  <Pencil />
                  Edit patient record
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function longDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const live = (pkgs: TreatmentPackage[]) => pkgs.filter((p) => p.status !== "Cancelled");

function upcomingVisits(pkgs: TreatmentPackage[]): { date: string; title: string }[] {
  const today = clinicToday();
  return live(pkgs)
    .flatMap((p) =>
      p.steps
        .filter((s) => s.state === "booked" && s.date! >= today)
        .map((s) => ({ date: s.date!, title: s.description })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

const STEP_CAPTION: Record<StepView["state"], string> = {
  done: "Completed",
  "in-clinic": "Checked in",
  booked: "Booked in calendar",
  missed: "Missed — rebook it",
  "to-book": "Due — not booked yet",
};

type TimelineEntry = {
  /** Empty for package sessions that haven't been booked yet. */
  date: string;
  title: string;
  caption: string;
  tone: "created" | "done" | "upcoming" | "free" | "surgery" | "pending" | "missed";
  /** The patient is in the clinic for this session right now. */
  inClinic?: boolean;
};

/**
 * Where the treatment stands: the session in progress, else the first one still to do
 * (missed, booked or due). Falls back to the latest entry once everything is done.
 */
function currentIndex(entries: TimelineEntry[]): number {
  const inClinic = entries.findIndex((e) => e.inClinic);
  if (inClinic >= 0) return inClinic;
  const next = entries.findIndex((e) => e.tone !== "done" && e.tone !== "created");
  return next >= 0 ? next : entries.length - 1;
}

/** Clinic visits, package creation and every scheduled session, oldest first. */
function TreatmentTimeline({
  patient,
  packages,
}: {
  patient: Patient;
  packages: TreatmentPackage[];
}) {
  const today = clinicToday();
  const entries: TimelineEntry[] = [
    ...(patient.lastVisit
      ? [
          {
            date: patient.lastVisit,
            title: "Clinic visit",
            caption: patient.concern ?? "Visit",
            tone: "done" as const,
          },
        ]
      : []),
    ...packages.map((p): TimelineEntry => ({
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(p.createdAt),
      ),
      title: `Package ${p.id} created`,
      caption: `${inr.format(p.total)} · by ${p.createdBy.name} · ${p.status}`,
      tone: "created",
    })),
    ...live(packages).flatMap((p) =>
      p.steps.map((s): TimelineEntry => ({
        date: s.date ?? s.dueDate,
        title: s.description,
        caption: `${p.id} · ${
          s.state === "to-book" && s.estimated
            ? "Due (estimated) — not booked yet"
            : STEP_CAPTION[s.state]
        }${s.complimentary ? " · complimentary" : ""}`,
        tone:
          s.state === "missed"
            ? "missed"
            : s.state === "done" || s.state === "in-clinic"
              ? "done"
              : s.state === "to-book"
                ? "pending"
                : s.surgery
                  ? "surgery"
                  : s.complimentary
                    ? "free"
                    : "upcoming",
        inClinic: s.state === "in-clinic",
      })),
    ),
  ];
  // Stable sort keeps "Package created" ahead of a same-day first session.
  // Unbooked sessions go last.
  entries.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const current = currentIndex(entries);

  // Long plans scroll inside the timeline; start with the current step in view.
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const currentEntry = entries[current];
  const currentKey = currentEntry ? `${currentEntry.date}-${currentEntry.title}` : "";
  useEffect(() => {
    const list = listRef.current;
    const row = currentRef.current;
    if (!list || !row) return;
    list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }, [patient.id, currentKey]);

  return (
    <div className="timeline" ref={listRef}>
      <h3>Treatment timeline</h3>
      {entries.length === 0 && (
        <p className="package-empty">
          No activity yet. Visits and package sessions will appear here.
        </p>
      )}
      {entries.map((e, i) => (
        <div
          key={`${e.date}-${e.title}-${i}`}
          ref={i === current ? currentRef : undefined}
          className={cn(i === current && "tl-current")}
          aria-current={i === current ? "step" : undefined}
        >
          <span>{e.date ? formatDay(e.date) : "To book"}</span>
          <i className={`tl-${e.tone}`} />
          <p>
            <strong>{e.title}</strong>
            <small>{e.caption}</small>
          </p>
        </div>
      ))}
    </div>
  );
}

function PackageList({
  patientId,
  canManage,
  onCreate,
}: {
  patientId: string;
  canManage: boolean;
  onCreate: () => void;
}) {
  const { data, isPending, isError, error } = usePackages(patientId);
  const setStatus = useSetPackageStatus(patientId);

  return (
    <section className="package-section">
      <div className="package-section-head">
        <h3>Treatment packages</h3>
        {canManage && (
          <Button size="sm" variant="outline" onClick={onCreate}>
            <PackagePlus />
            Create package
          </Button>
        )}
      </div>
      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <Banner tone="error">{errorText(error)}</Banner>
      ) : data.length === 0 ? (
        <p className="package-empty">
          No packages yet.{canManage ? " Create one after the consultation." : ""}
        </p>
      ) : (
        data.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            actions={
              canManage &&
              pkg.status !== "Cancelled" && (
                <>
                  {pkg.status === "Accepted" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: pkg.id, status: "Cancelled" })}
                    >
                      <CircleSlash />
                      Cancel package
                    </Button>
                  )}
                </>
              )
            }
          />
        ))
      )}
      {setStatus.isError && <Banner tone="error">{errorText(setStatus.error)}</Banner>}
    </section>
  );
}

function PackageCard({ pkg, actions }: { pkg: TreatmentPackage; actions?: ReactNode }) {
  const created = new Date(pkg.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <article className="package-card">
      <header>
        <div>
          <strong>{pkg.name}</strong>
          <small>
            {pkg.id} · Created by {pkg.createdBy.name} · {created}
          </small>
        </div>
        <StatusChip tone={PACKAGE_TONE[pkg.status]}>{pkg.status}</StatusChip>
      </header>
      <PriceLines lines={pkg.lines} total={pkg.total} />
      <PackageProgress pkg={pkg} />
      {pkg.notes && <p className="package-notes">{pkg.notes}</p>}
      {actions && <footer>{actions}</footer>}
    </article>
  );
}

/** "3 of 12 visits done · Next: Derma roller, due 10 Oct". */
function PackageProgress({ pkg }: { pkg: TreatmentPackage }) {
  const next = pkg.next !== null ? pkg.steps[pkg.next] : undefined;
  return (
    <p className="package-progress">
      <span>
        {pkg.progress.done} of {pkg.progress.total} visit{pkg.progress.total === 1 ? "" : "s"} done
      </span>
      {next && pkg.status === "Accepted" && (
        <span className={cn(next.state === "missed" && "overdue")}>
          Next: {next.description}
          {next.state === "missed"
            ? ` — missed on ${formatDay(next.date!)}, rebook`
            : next.surgery
              ? " — not booked yet"
              : `, due ${next.estimated ? "~" : ""}${formatDay(next.dueDate)}`}
        </span>
      )}
    </p>
  );
}

function PriceLines({
  lines,
  total,
}: {
  lines: {
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    complimentary: boolean;
  }[];
  total: number;
}) {
  return (
    <div className="price-lines">
      {lines.map((l) => (
        <div key={l.description} className={l.complimentary ? "free" : undefined}>
          <span>
            {l.description}
            <small>
              {l.quantity.toLocaleString("en-IN")} {l.unit}
              {l.quantity === 1 ? "" : "s"} × {inr.format(l.unitPrice)}
            </small>
          </span>
          <strong>
            {l.complimentary ? (
              <>
                <s>{inr.format(l.quantity * l.unitPrice)}</s> Free
              </>
            ) : (
              inr.format(l.amount)
            )}
          </strong>
        </div>
      ))}
      <div className="price-total">
        <span>Package total</span>
        <strong>{inr.format(total)}</strong>
      </div>
    </div>
  );
}

/* ---------- edit ---------- */

export function EditPatientDialog({
  editing,
  canCreatePackages,
  onOpenChange,
  onNotice,
  onPackageCreated,
}: {
  editing: { id: string; tab: EditTab } | null;
  canCreatePackages: boolean;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string) => void;
  /** Called after "Next" — the parent takes the user to the calendar to book sessions. */
  onPackageCreated: (pkg: TreatmentPackage) => void;
}) {
  const { data: patient } = usePatient(editing?.id ?? null);
  const [tab, setTab] = useState<EditTab>("details");
  const [lastEditing, setLastEditing] = useState(editing);
  // Open on whichever tab was requested each time the dialog opens.
  if (editing !== lastEditing) {
    setLastEditing(editing);
    if (editing) setTab(editing.tab);
  }

  return (
    <Dialog open={editing !== null} onOpenChange={onOpenChange}>
      <DialogContent className="edit-patient-dialog">
        <DialogHeader>
          <DialogTitle>Edit {patient?.name ?? "patient"}</DialogTitle>
          <DialogDescription>
            Update the record or build a treatment package after consultation.
          </DialogDescription>
        </DialogHeader>
        {patient && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)}>
            <TabsList className="edit-tabs">
              <TabsTrigger value="details">
                <Pencil />
                Details
              </TabsTrigger>
              <TabsTrigger value="package">
                <PackagePlus />
                Create package
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details">
              <PatientDetailsForm
                key={patient.id}
                patient={patient}
                onCancel={() => onOpenChange(false)}
                onSaved={() => {
                  onOpenChange(false);
                  onNotice(`${patient.name}’s record updated.`);
                }}
              />
            </TabsContent>
            <TabsContent value="package">
              {canCreatePackages ? (
                <PackageBuilder
                  key={patient.id}
                  patient={patient}
                  onCancel={() => onOpenChange(false)}
                  onCreated={(pkg) => {
                    onOpenChange(false);
                    onPackageCreated(pkg);
                  }}
                />
              ) : (
                <Banner tone="warning">
                  Only doctors and Super Admins can create treatment packages.
                </Banner>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PatientDetailsForm({
  patient,
  onCancel,
  onSaved,
}: {
  patient: Patient;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const update = useUpdatePatient(patient.id);
  const { data: concerns } = useCatalog<ConcernOption>("concerns");
  const [form, setForm] = useState({
    name: patient.name,
    age: patient.age != null ? String(patient.age) : "",
    phone: patient.phone,
    email: patient.email ?? "",
    concern: patient.concern ?? "",
    notes: patient.notes ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  // Active concerns from Settings, keeping the patient's current value even if it's not in the list.
  const concernNames = [
    ...new Set(
      [...(concerns ?? []).filter((c) => c.active).map((c) => c.name), patient.concern].filter(
        (c): c is string => !!c,
      ),
    ),
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        name: form.name.trim(),
        ...(form.age !== "" && { age: Number(form.age) }),
        phone: form.phone.trim(),
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(form.concern && { concern: form.concern }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form onSubmit={submit}>
      {update.isError && (
        <div className="mt-2">
          <Banner tone="error">{errorText(update.error)}</Banner>
        </div>
      )}
      <div className="form-grid mt-4">
        <label>
          Full name
          <input required maxLength={120} value={form.name} onChange={set("name")} />
        </label>
        <label>
          Age
          <input
            type="number"
            min={0}
            max={120}
            value={form.age}
            onChange={set("age")}
            placeholder="Optional"
          />
        </label>
        <label>
          Mobile number
          <input required value={form.phone} onChange={set("phone")} placeholder="+91" />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set("email")} placeholder="Optional" />
        </label>
        <label>
          Primary concern
          <select value={form.concern} onChange={set("concern")}>
            {!patient.concern && <option value="">Not recorded yet</option>}
            {concernNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Clinical notes
          <textarea
            maxLength={2000}
            value={form.notes}
            onChange={set("notes")}
            placeholder="Consultation findings, contraindications, follow-up notes"
          />
        </label>
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PackageBuilder({
  patient,
  onCancel,
  onCreated,
}: {
  patient: Patient;
  onCancel: () => void;
  onCreated: (pkg: TreatmentPackage) => void;
}) {
  const { data: treatments, isPending, isError, error } = useCatalog<TreatmentOption>("treatments");
  const { data: plans } = usePlans();
  const create = useCreatePackage(patient.id);
  const [planId, setPlanId] = useState("");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [startDate, setStartDate] = useState(clinicToday());
  const [notes, setNotes] = useState("");

  const plan = plans?.find((p) => p.id === planId);
  const request: PackageRequest = {
    ...(plan && { planId: plan.id }),
    items,
    startDate,
    ...(notes.trim() && { notes: notes.trim() }),
  };
  const priced = useDebounced(items, 350);
  const quote = useQuote(priced.length ? { items: priced, startDate } : null);
  const active = (treatments ?? []).filter((t) => t.active);
  const activePlans = (plans ?? []).filter((p) => p.active);

  if (isPending) return <Skeleton className="mt-4 h-64 w-full" />;
  if (isError)
    return (
      <div className="mt-4">
        <Banner tone="error">{errorText(error)}</Banner>
      </div>
    );

  const choosePlan = (id: string) => {
    setPlanId(id);
    const chosen = plans?.find((p) => p.id === id);
    setItems(chosen ? structuredClone(chosen.items) : []);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (items.length) create.mutate(request, { onSuccess: onCreated });
  };
  const startsWithSurgery = quote.data?.steps.some((s) => s.surgery);

  return (
    <form onSubmit={submit} className="package-builder plan-builder">
      <div className="package-options">
        <div className="form-grid">
          <label>
            Start from plan
            <select value={planId} onChange={(e) => choosePlan(e.target.value)}>
              <option value="">Custom — build from scratch</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            First visit due
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          {plan?.description && <p className="full field-note">{plan.description}</p>}
        </div>
        <PlanItemsEditor items={items} onChange={setItems} treatments={active} pricing />
        <p className="field-note">
          Leave a price empty for the Settings price, enter a new one for this patient, or set ₹0 /
          Free to waive it.
        </p>
        <label className="package-notes-field">
          Notes for the patient
          <textarea
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — pre-op instructions, payment terms"
          />
        </label>
      </div>

      <aside className="package-summary" aria-live="polite">
        <h4>{plan?.name ?? "Custom plan"}</h4>
        <p className="package-summary-for">
          For {patient.name}
          {patient.concern && ` · ${patient.concern}`}
        </p>
        {items.length === 0 ? (
          <p className="package-empty">Choose a plan or add steps to see the price and dates.</p>
        ) : (
          <>
            {quote.data && <PriceLines lines={quote.data.lines} total={quote.data.total} />}
            <PlanPreview
              quote={quote.data}
              isPending={quote.isFetching}
              error={quote.error}
              markSurgical={false}
              showRounds={false}
            />
          </>
        )}
        {create.isError && <Banner tone="error">{errorText(create.error)}</Banner>}
        <div className="package-actions">
          <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!items.length || create.isPending}>
            {create.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                {startsWithSurgery ? "Next: schedule surgery" : "Create package"}
                <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </aside>
    </form>
  );
}
