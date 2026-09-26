import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CircleSlash,
  LoaderCircle,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Syringe,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { getSessionUser, initials } from "@/lib/mock-auth";
import { useDoctors } from "@/components/appointments/appointments-api";
import {
  addDays,
  buildSchedule,
  clinicToday,
  formatDay,
  formatVisit,
  previewPackage,
  reconcileSequence,
  useCreatePackage,
  usePackages,
  usePatient,
  useSetPackageStatus,
  useUpdatePatient,
  type PackageStatus,
  type PackageStep,
  type Patient,
  type StepCounts,
  type StepKind,
  type TreatmentPackage,
} from "./patients-api";

export type EditTab = "details" | "package";

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Only doctors and Super Admins can create packages.";
    return error.message;
  }
  return "Couldn’t reach the clinic server. Make sure the backend is running.";
}

const PACKAGE_TONE: Record<PackageStatus, Tone> = {
  Proposed: "warning",
  Accepted: "success",
  Completed: "neutral",
  Cancelled: "error",
};

/* ---------- profile ---------- */

export function PatientProfileDialog({
  patientId,
  canCreatePackages,
  onOpenChange,
  onEdit,
}: {
  patientId: string | null;
  canCreatePackages: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: string, tab: EditTab) => void;
}) {
  const { data: patient, isPending } = usePatient(patientId);
  const { data: packages } = usePackages(patientId);
  const next = upcomingSteps(packages ?? [])[0];

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
                    {formatDay(next.date)} · {next.description}
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
              <Button onClick={() => onEdit(patient.id, "details")}>
                <Pencil />
                Edit patient record
              </Button>
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

function upcomingSteps(pkgs: TreatmentPackage[]): PackageStep[] {
  const today = clinicToday();
  return live(pkgs)
    .flatMap((p) => p.schedule)
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

type TimelineEntry = {
  date: string;
  title: string;
  caption: string;
  tone: "created" | "done" | "upcoming" | "free" | "surgery";
};

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
      p.schedule.map((s): TimelineEntry => ({
        date: s.date,
        title: s.description,
        caption: `${p.id} · ${p.sessionTime} · ${p.doctor} · ${s.date < today ? "Due — not yet recorded" : s.date === today ? "Today" : "In calendar"}`,
        tone:
          s.kind === "transplant"
            ? "surgery"
            : s.date < today
              ? "done"
              : s.complimentary
                ? "free"
                : "upcoming",
      })),
    ),
  ];
  // Stable sort keeps "Package created" ahead of a same-day first session.
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="timeline">
      <h3>Treatment timeline</h3>
      {entries.length === 0 && (
        <p className="package-empty">
          No activity yet. Visits and package sessions will appear here.
        </p>
      )}
      {entries.map((e, i) => (
        <div key={`${e.date}-${e.title}-${i}`}>
          <span>{formatDay(e.date)}</span>
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
              pkg.status === "Proposed" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: pkg.id, status: "Cancelled" })}
                  >
                    <CircleSlash />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: pkg.id, status: "Accepted" })}
                  >
                    <Check />
                    Mark accepted
                  </Button>
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
          <strong>{pkg.id}</strong>
          <small>
            Created by {pkg.createdBy.name} · {created}
          </small>
        </div>
        <StatusChip tone={PACKAGE_TONE[pkg.status]}>{pkg.status}</StatusChip>
      </header>
      <PriceLines lines={pkg.lines} total={pkg.total} />
      {pkg.notes && <p className="package-notes">{pkg.notes}</p>}
      {actions && <footer>{actions}</footer>}
    </article>
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
}: {
  editing: { id: string; tab: EditTab } | null;
  canCreatePackages: boolean;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string) => void;
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
                    onNotice(
                      `Package ${pkg.id} created for ${patient.name} · ${inr.format(pkg.total)}.`,
                    );
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
  const create = useCreatePackage(patient.id);

  const prp = treatments?.find(
    (t) => t.active && t.category === "PRP" && t.pricingUnit === "session",
  );
  const fue = treatments?.find(
    (t) => t.active && t.category === "Transplant" && t.pricingUnit === "graft",
  );

  const [prpSessions, setPrpSessions] = useState(0);
  const [withTransplant, setWithTransplant] = useState(false);
  const [grafts, setGrafts] = useState("2500");
  const [pricePerGraft, setPricePerGraft] = useState<string | null>(null); // null = use Settings price
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState(() => addDays(clinicToday(), 1));
  const [intervalMonths, setIntervalMonths] = useState(3);
  const [sessionTime, setSessionTime] = useState("10:00");
  const { data: doctors } = useDoctors();
  const [doctor, setDoctor] = useState(() => {
    const me = getSessionUser();
    return me.role === "Reception" ? "" : me.name;
  });
  // The user's arrangement; reconciled with the current quantities on every render.
  const [order, setOrder] = useState<StepKind[]>([]);

  const graftPrice = pricePerGraft ?? String(fue?.price ?? "");
  const graftPriceChanged =
    pricePerGraft !== null && fue !== undefined && Number(pricePerGraft) !== fue.price;
  const request = {
    prpSessions,
    ...(withTransplant &&
      Number(grafts) > 0 && {
        transplant: {
          grafts: Number(grafts),
          ...(graftPriceChanged && { pricePerGraft: Number(graftPrice) }),
        },
      }),
    ...(notes.trim() && { notes: notes.trim() }),
  };
  const preview = previewPackage(request, prp, fue);
  const empty = preview.lines.length === 0;

  const counts: StepCounts = {
    prp: prp ? preview.paidPrp : 0,
    transplant: request.transplant && fue ? 1 : 0,
    "prp-free": prp ? preview.freePrp : 0,
  };
  const sequence = reconcileSequence(order, counts);
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const schedule = validStart
    ? buildSchedule({
        sequence,
        counts,
        prpName: prp?.name ?? "PRP session",
        transplant: preview.lines.find((l) => l.unit === "graft")?.description,
        startDate,
        intervalMonths,
      })
    : [];
  const freeBeforeTransplant =
    counts.transplant > 0 &&
    sequence.indexOf("prp-free") > -1 &&
    sequence.indexOf("prp-free") < sequence.indexOf("transplant");
  const move = (from: number, to: number) => {
    const next = [...sequence];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step!);
    setOrder(next);
  };
  const fullRequest = {
    ...request,
    startDate,
    intervalMonths,
    sequence,
    sessionTime,
    ...(doctor && { doctor }),
  };

  if (isPending) return <Skeleton className="mt-4 h-64 w-full" />;
  if (isError)
    return (
      <div className="mt-4">
        <Banner tone="error">{errorText(error)}</Banner>
      </div>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!empty && validStart) create.mutate(fullRequest, { onSuccess: onCreated });
  };

  return (
    <form onSubmit={submit} className="package-builder">
      <div className="package-options">
        <section className="package-option">
          <header>
            <span className="package-option-icon">
              <Syringe />
            </span>
            <div>
              <strong>PRP sessions</strong>
              <small>
                {prp
                  ? `${inr.format(prp.price)} per session · from Settings`
                  : "Add a per-session PRP treatment in Settings"}
              </small>
            </div>
          </header>
          <div className="stepper" role="group" aria-label="Number of PRP sessions">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Fewer sessions"
              disabled={!prp || prpSessions <= 0}
              onClick={() => setPrpSessions((n) => Math.max(0, n - 1))}
            >
              <Minus />
            </Button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              value={prpSessions}
              disabled={!prp}
              aria-label="PRP sessions"
              onChange={(e) =>
                setPrpSessions(Math.min(24, Math.max(0, Math.floor(Number(e.target.value) || 0))))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More sessions"
              disabled={!prp || prpSessions >= 24}
              onClick={() => setPrpSessions((n) => Math.min(24, n + 1))}
            >
              <Plus />
            </Button>
          </div>
        </section>

        <section className={`package-option${withTransplant ? " selected" : ""}`}>
          <header>
            <span className="package-option-icon">
              <Scissors />
            </span>
            <div>
              <strong>{fue?.name ?? "Hair transplant"}</strong>
              <small>
                {fue
                  ? `Priced per graft${fue.complimentaryPrpSessions ? ` · includes ${fue.complimentaryPrpSessions} free PRP sessions` : ""}`
                  : "Add a per-graft transplant treatment in Settings"}
              </small>
            </div>
            <Switch
              checked={withTransplant}
              disabled={!fue}
              onCheckedChange={setWithTransplant}
              aria-label="Include hair transplant"
            />
          </header>
          {withTransplant && fue && (
            <div className="form-grid">
              <label>
                Number of grafts
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={8000}
                  step={50}
                  value={grafts}
                  onChange={(e) => setGrafts(e.target.value)}
                />
              </label>
              {/* Reset sits outside the <label> so the label stays bound to the input. */}
              <div className="graft-price-field">
                <label>
                  Price per graft (₹)
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    step={1}
                    value={graftPrice}
                    onChange={(e) => setPricePerGraft(e.target.value)}
                  />
                </label>
                {graftPriceChanged && (
                  <button
                    type="button"
                    className="link-reset"
                    onClick={() => setPricePerGraft(null)}
                  >
                    <RotateCcw />
                    Reset to {inr.format(fue.price)}
                  </button>
                )}
              </div>
              {graftPriceChanged && (
                <p className="full field-hint">
                  Custom price for this package only. Settings default stays {inr.format(fue.price)}{" "}
                  per graft.
                </p>
              )}
            </div>
          )}
        </section>

        {!empty && (
          <section className="package-option">
            <header>
              <span className="package-option-icon">
                <CalendarDays />
              </span>
              <div>
                <strong>Schedule</strong>
                <small>
                  First session on the start date, then one every {intervalMonths} month
                  {intervalMonths === 1 ? "" : "s"}, each booked in the appointment calendar. Use
                  the arrows to change the order.
                </small>
              </div>
            </header>
            <div className="form-grid">
              <label>
                Start date
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label>
                Months between sessions
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={intervalMonths}
                  onChange={(e) =>
                    setIntervalMonths(
                      Math.min(12, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                    )
                  }
                />
              </label>
              <label>
                Session time
                <input
                  required
                  type="time"
                  step={900}
                  value={sessionTime}
                  onChange={(e) => setSessionTime(e.target.value)}
                />
              </label>
              <label>
                Doctor
                <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                  {[...new Set([doctor, ...(doctors ?? []).map((d) => d.name)])]
                    .filter(Boolean)
                    .map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                </select>
              </label>
            </div>
            <ol className="schedule-steps" aria-label="Session order">
              {schedule.map((step, i) => (
                <li key={`${step.kind}-${i}`} className={`step-${step.kind}`}>
                  <span className="step-no">{i + 1}</span>
                  <div className="min-w-0">
                    <strong>{step.description}</strong>
                    <small>{longDate(step.date)}</small>
                  </div>
                  {step.complimentary && <StatusChip tone="success">Free</StatusChip>}
                  <div className="step-move">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${step.description} earlier`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${step.description} later`}
                      disabled={i === schedule.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            {freeBeforeTransplant && (
              <p className="field-hint">
                Complimentary PRP is scheduled before the transplant it comes with.
              </p>
            )}
          </section>
        )}

        <label className="package-notes-field">
          Notes for the patient
          <textarea
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — session schedule, pre-op instructions, payment terms"
          />
        </label>
      </div>

      <aside className="package-summary" aria-live="polite">
        <h4>Package summary</h4>
        <p className="package-summary-for">
          For {patient.name}
          {patient.concern && ` · ${patient.concern}`}
        </p>
        {empty ? (
          <p className="package-empty">Add PRP sessions or a hair transplant to see the price.</p>
        ) : (
          <>
            <PriceLines lines={preview.lines} total={preview.total} />
            <p className="package-sessions">
              {preview.paidPrp + preview.freePrp} PRP sessions in total
              {preview.freePrp > 0 && ` (${preview.paidPrp} paid + ${preview.freePrp} free)`}
            </p>
            {schedule.length > 0 && (
              <p className="package-sessions">
                {schedule.length === 1
                  ? `On ${longDate(schedule[0]!.date)}`
                  : `${longDate(schedule[0]!.date)} → ${longDate(schedule[schedule.length - 1]!.date)}`}
              </p>
            )}
          </>
        )}
        {create.isError && <Banner tone="error">{errorText(create.error)}</Banner>}
        <div className="package-actions">
          <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={empty || !validStart || create.isPending}>
            {create.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <PackagePlus />
                Create package
              </>
            )}
          </Button>
        </div>
      </aside>
    </form>
  );
}
