import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  ChevronsUpDown,
  IndianRupee,
  Lock,
  LoaderCircle,
  PackagePlus,
  Undo2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { Banner } from "@/components/crm-ui";
import {
  usePatients,
  usePackages,
  useSetGrafts,
  stepForBooking,
  clinicToday,
  formatDay,
  type Patient,
  type TreatmentPackage,
} from "@/components/patients/patients-api";
import { useCatalog, type TreatmentOption } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, ApiError } from "@/lib/api";
import {
  closureOn,
  formatTime,
  hoursOn,
  useClinicClosures,
  useClinicTimings,
} from "@/lib/clinic-timings";
import { getSessionUser, initials } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import { isValidMobile, phoneDigits } from "@/lib/validation";
import { DateInput } from "@/components/form/date-input";
import { PhoneInput } from "@/components/form/phone-input";
import { TimeInput } from "@/components/form/time-input";
import { ValidatedForm } from "@/components/form/validated-form";
import {
  isOpen,
  useAppointmentStatus,
  clinicDateOf,
  clinicTimeOf,
  useDoctors,
  type Appointment,
} from "./appointments-api";
import { BillingSection } from "./billing-section";
import { CompleteVisitDialog, type Assessment } from "./complete-visit-dialog";
import { usePlans } from "@/components/plans/plans-api";
import { dosing } from "@/components/history/prescription-options";
import { inrPrice } from "@/components/inventory/inventory-api";
import { SelectInput } from "@/components/form/select-input";

/** "current" keeps the appointment's patient as-is when editing (including walk-ins with no record). */
type PatientChoice =
  { kind: "current" } | { kind: "existing"; patient: Patient } | { kind: "new" } | null;

const validPhone = (phone: string) => isValidMobile(phoneDigits(phone));
/** The last minute before closing, so the picker never offers the closing time itself. */
const beforeClosing = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const t = h * 60 + m - 1;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
/** Same number regardless of spaces, dashes or a +91 prefix (matches the backend). */
const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);

/** Calendar slot for a treatment: its duration, capped at a full clinic day (matches the backend). */
function slotMinutes(t: TreatmentOption | undefined): number {
  if (!t) return 30;
  const upper = t.durationMax ?? t.duration;
  const minutes = t.durationUnit === "days" ? 480 : t.durationUnit === "hours" ? upper * 60 : upper;
  return Math.min(480, minutes);
}

export type AppointmentSaved = { appointment: Appointment; isNewPatient: boolean; edited: boolean };

/** A package session being booked from the calendar's scheduling panel. */
export type SessionToBook = { pkg: TreatmentPackage; index: number };

/** Books a new appointment, or edits `appointment` when one is given. */
export function AppointmentDialog({
  open,
  appointment,
  session,
  defaultDate,
  onOpenChange,
  onSaved,
  onSessionBooked,
  onOpenPatient,
  onPaymentReceived,
  onBookNext,
  onCreatePackage,
}: {
  open: boolean;
  appointment?: Appointment | null | undefined;
  /** Books this package session instead of a free-standing appointment. */
  session?: SessionToBook | null | undefined;
  defaultDate?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: AppointmentSaved) => void;
  onSessionBooked?: ((pkg: TreatmentPackage, index: number) => void) | undefined;
  onOpenPatient?: ((id: string) => void) | undefined;
  onPaymentReceived?: ((message: string) => void) | undefined;
  /** "Book next" after a plan visit is completed: opens the booking for the plan's next step. */
  onBookNext?:
    ((next: { patientId: string; packageId: string; index: number }) => void) | undefined;
  /** After a consultation: open the package builder for this patient, starting from the plan. */
  onCreatePackage?: ((patientId: string, planId: string) => void) | undefined;
}) {
  const editing = !!appointment;
  const { data: plans } = usePlans();
  // The plan the doctor recommended when completing a consultation, if any.
  const [recommended, setRecommended] = useState<{ patientId: string; planId: string } | null>(
    null,
  );
  const recommendedPlan = recommended && plans?.find((p) => p.id === recommended.planId);
  // "details" = the appointment form; "billing" = payment details + receive payment.
  const [view, setView] = useState<"details" | "billing">("details");
  const [paidMessage, setPaidMessage] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (appointment?.id ?? "new") : null;
  if (key !== lastKey) {
    // Each time the dialog opens (or shows another appointment) start on the details.
    setLastKey(key);
    setView("details");
    setPaidMessage(null);
    setRecommended(null);
  }
  const billing = view === "billing" && appointment;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="booking-dialog">
        <DialogHeader>
          <DialogTitle>
            {billing
              ? `Billing · ${appointment.patientName}`
              : session
                ? "Book plan visit"
                : editing
                  ? appointment.status === "Completed"
                    ? "Appointment details"
                    : "Edit appointment"
                  : "Book appointment"}
          </DialogTitle>
          <DialogDescription>
            {billing
              ? "Payment details for this visit. Add each payment as it’s received."
              : session
                ? `${session.pkg.steps[session.index]?.description ?? "Visit"} for ${session.pkg.patientName} — due ${formatDay(session.pkg.steps[session.index]?.dueDate ?? clinicToday())}. Pick the slot.`
                : editing
                  ? appointment.status === "Completed"
                    ? "This visit is completed and can’t be edited. You can still receive payment."
                    : "Reschedule, or change the patient, doctor or treatment. Mark it completed when the visit is done."
                  : "Pick an existing patient or add a new one with just a name and phone number."}
          </DialogDescription>
        </DialogHeader>
        {appointment?.status === "Completed" &&
          appointment.packageId &&
          appointment.patientId &&
          onBookNext && (
            <NextVisitCallout
              patientId={appointment.patientId}
              packageId={appointment.packageId}
              onBook={onBookNext}
            />
          )}
        {billing && (
          <>
            {paidMessage && (
              <div className="mt-2">
                <Banner tone="success" onClose={() => setPaidMessage(null)}>
                  {paidMessage}
                </Banner>
              </div>
            )}
            {recommended && recommendedPlan && onCreatePackage && (
              <div className="next-visit">
                <PackagePlus />
                <div className="min-w-0">
                  <strong>Recommended: {recommendedPlan.name}</strong>
                  <small>
                    Create the package now, or later from the patient’s record. Surgery in it goes
                    to Pending bookings.
                  </small>
                </div>
                <Button
                  size="sm"
                  onClick={() => onCreatePackage(recommended.patientId, recommended.planId)}
                >
                  Create package
                </Button>
              </div>
            )}
            <BillingSection
              target={{ appointment }}
              onBack={() => {
                setView("details");
                setPaidMessage(null);
              }}
              onReceived={(message) => {
                setPaidMessage(message);
                onPaymentReceived?.(`${appointment.patientName} — ${message}`);
              }}
            />
          </>
        )}
        {/* Remount per opening so the form starts fresh. */}
        {open && !billing && (
          <AppointmentForm
            key={appointment?.id ?? (session ? `${session.pkg.id}-${session.index}` : "new")}
            appointment={appointment ?? undefined}
            session={session ?? undefined}
            defaultDate={defaultDate ?? clinicToday()}
            onCancel={() => onOpenChange(false)}
            onSaved={onSaved}
            onSessionBooked={onSessionBooked}
            onOpenPatient={onOpenPatient}
            onReceivePayment={() => setView("billing")}
            onCompleted={(a, assessment) => {
              // Visit done → straight to payment.
              const given = a.medicines?.length ?? 0;
              setPaidMessage(
                (given
                  ? `Visit marked completed and ${given} medicine${given > 1 ? "s" : ""} taken out of inventory.`
                  : "Visit marked completed.") +
                  (assessment?.concern ? ` Concern recorded: ${assessment.concern}.` : "") +
                  " Receive the payment below.",
              );
              setRecommended(
                assessment?.planId && a.patientId
                  ? { patientId: a.patientId, planId: assessment.planId }
                  : null,
              );
              setView("billing");
              onPaymentReceived?.(`${a.patientName}’s ${a.type} marked completed.`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentForm({
  appointment,
  session,
  defaultDate,
  onCancel,
  onSaved,
  onSessionBooked,
  onOpenPatient,
  onReceivePayment,
  onCompleted,
}: {
  appointment: Appointment | undefined;
  session: SessionToBook | undefined;
  defaultDate: string;
  onCancel: () => void;
  onSaved: (result: AppointmentSaved) => void;
  onSessionBooked?: ((pkg: TreatmentPackage, index: number) => void) | undefined;
  onOpenPatient?: ((id: string) => void) | undefined;
  onReceivePayment?: (() => void) | undefined;
  onCompleted?: ((appointment: Appointment, assessment?: Assessment) => void) | undefined;
}) {
  const editing = appointment !== undefined;
  const sessionStep = session?.pkg.steps[session.index];
  const lockedToPackage = !!appointment?.packageId || !!session;
  const packageId = appointment?.packageId ?? session?.pkg.id;
  const currentName = appointment?.patientName ?? session?.pkg.patientName ?? "";
  const queryClient = useQueryClient();
  const { data: patients, isPending: patientsLoading } = usePatients();
  const { data: treatments } = useCatalog<TreatmentOption>("treatments");
  const { data: doctors } = useDoctors();
  const activeTreatments = (treatments ?? []).filter((t) => t.active);
  const currentPatientId = appointment?.patientId ?? session?.pkg.patientId;
  const currentPatient = currentPatientId
    ? patients?.find((p) => p.id === currentPatientId)
    : undefined;

  const [choice, setChoice] = useState<PatientChoice>(
    editing || session ? { kind: "current" } : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [date, setDate] = useState(() =>
    appointment
      ? clinicDateOf(appointment.startsAt)
      : defaultDate < clinicToday()
        ? clinicToday()
        : defaultDate,
  );
  const [time, setTime] = useState(() =>
    appointment ? clinicTimeOf(appointment.startsAt) : "10:00",
  );
  // Follows the appointment until the user picks another treatment, so a rename made
  // elsewhere (e.g. the actual graft count) isn't undone by saving this form.
  const [pickedTreatment, setTreatmentName] = useState<string | null>(null);
  const treatmentName =
    pickedTreatment ?? appointment?.type ?? sessionStep?.description ?? "Consultation";
  const [days, setDays] = useState(appointment?.days ?? 1);
  const [doctor, setDoctor] = useState(() => {
    if (appointment) return appointment.doctor;
    const me = getSessionUser();
    return me.role === "Doctor" || me.role === "SuperAdmin" ? me.name : "";
  });
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [touched, setTouched] = useState(false);
  const { reopen } = useAppointmentStatus();
  const [completing, setCompleting] = useState(false);
  // Once the patient is checked in (or done) the slot is history — no rescheduling.
  // Missed visits stay open: reschedule them, or check the patient in.
  const locked = !!appointment && !isOpen(appointment);
  const readOnly = appointment?.status === "Completed";
  const reschedulingNow =
    !!appointment &&
    !locked &&
    (date !== clinicDateOf(appointment.startsAt) || time !== clinicTimeOf(appointment.startsAt));

  // A new visit for a treatment in the patient's plan takes that step (linked by the server).
  const chosenPatientId =
    choice?.kind === "existing"
      ? choice.patient.id
      : choice?.kind === "current"
        ? (currentPatientId ?? null)
        : null;
  const { data: patientPackages } = usePackages(editing || session ? null : chosenPatientId);
  const planStep = patientPackages ? stepForBooking(patientPackages, treatmentName) : null;
  const prpHint = planStep
    ? `Part of ${planStep.pkg.name} (${planStep.pkg.id}) · visit ${planStep.step.index + 1} of ${planStep.pkg.steps.length}${planStep.step.complimentary ? " · complimentary" : ""} · due ${formatDay(planStep.step.dueDate)}`
    : null;

  const doctorOptions = [...new Set([doctor, ...(doctors ?? []).map((d) => d.name)])].filter(
    Boolean,
  );
  const chosenDoctor = doctor || doctorOptions[0] || "";
  const treatment = activeTreatments.find((t) => t.name === treatmentName);
  // Surgery (treatments tagged surgical in Settings) can take 1–3 days.
  const surgeryOption = activeTreatments.find((t) => t.surgical);
  // A saved surgery always has `days` (as on the backend) — even 1-day ones, and package
  // surgeries whose type is the step's description rather than a treatment name.
  const isSurgery =
    !!sessionStep?.surgery ||
    appointment?.days !== undefined ||
    (!sessionStep && !!treatment?.surgical);
  const maxDays = Math.min(3, (treatment ?? surgeryOption)?.durationMax ?? 3);

  // New and moved visits must fall within Settings → Clinic timings; untouched ones keep their slot.
  // Surgery can start at any time of day, but not on a closed day or holiday.
  const timings = useClinicTimings();
  const closures = useClinicClosures();
  const dayHours = date ? hoursOn(timings, date) : null;
  const dayClosure = date ? closureOn(closures, date) : undefined;
  const checkTime = dayHours?.open && !dayClosure && !isSurgery;
  const hoursError =
    !dayHours || !time || locked || (appointment && !reschedulingNow)
      ? null
      : dayClosure
        ? `The clinic is closed on ${formatDay(date)} (${dayClosure.reason}). Pick another date.`
        : !dayHours.open
          ? `The clinic is closed on ${dayHours.day}s. Pick another date.`
          : checkTime && (time < dayHours.opensAt || time >= dayHours.closesAt)
            ? `Pick a time between ${formatTime(dayHours.opensAt)} and ${formatTime(dayHours.closesAt)} (clinic hours on ${dayHours.day}s).`
            : null;
  // Warn before submitting if the "new" patient's number is already on file.
  const duplicate =
    choice?.kind === "new" && phoneKey(newPhone).length >= 10
      ? patients?.find((p) => phoneKey(p.phone) === phoneKey(newPhone))
      : undefined;

  const patientPart = () =>
    choice?.kind === "existing"
      ? choice.patient.id !== appointment?.patientId
        ? { patientId: choice.patient.id }
        : {}
      : choice?.kind === "new"
        ? { newPatient: { name: newName.trim(), phone: newPhone.trim() } }
        : {};

  const save = useMutation({
    mutationFn: async () => {
      const startsAt = `${date}T${time}:00+05:30`;
      if (session) {
        const pkg = await api<TreatmentPackage>(
          `/packages/${session.pkg.id}/sessions/${session.index}/appointment`,
          {
            method: "POST",
            body: JSON.stringify({
              startsAt,
              doctor: chosenDoctor,
              ...(isSurgery && { days }),
              ...(notes.trim() && { notes: notes.trim() }),
            }),
          },
        );
        onSessionBooked?.(pkg, session.index);
        return null;
      }
      if (!appointment) {
        return api<Appointment>("/appointments", {
          method: "POST",
          body: JSON.stringify({
            ...patientPart(),
            type: treatmentName,
            doctor: chosenDoctor,
            startsAt,
            durationMinutes: slotMinutes(treatment),
            ...(isSurgery && { days }),
            ...(notes.trim() && { notes: notes.trim() }),
          }),
        });
      }
      const treatmentChanged = pickedTreatment !== null && pickedTreatment !== appointment.type;
      return api<Appointment>(`/appointments/${appointment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...patientPart(),
          ...(treatmentChanged && { type: treatmentName }),
          doctor: chosenDoctor,
          startsAt,
          notes: notes.trim(),
          ...(isSurgery && { days }),
          // Keep the existing slot length unless the treatment itself changed.
          ...(treatmentChanged && treatment && { durationMinutes: slotMinutes(treatment) }),
        }),
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (!saved) {
        // Package session booked; the calendar and the package both change.
        void queryClient.invalidateQueries({ queryKey: ["packages"] });
        return;
      }
      // Rescheduling a package session also moves it in the package's timeline.
      if (saved.packageId) void queryClient.invalidateQueries({ queryKey: ["packages"] });
      if (choice?.kind === "new") void queryClient.invalidateQueries({ queryKey: ["patients"] });
      onSaved({ appointment: saved, isNewPatient: choice?.kind === "new", edited: editing });
    },
  });

  const newPatientValid = newName.trim().length > 0 && validPhone(newPhone);
  const patientReady =
    choice?.kind === "current" ||
    choice?.kind === "existing" ||
    (choice?.kind === "new" && newPatientValid && !duplicate);
  const canSubmit =
    patientReady && !!date && !!time && !hoursError && !!chosenDoctor && !save.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setTouched(true);
    if (canSubmit) save.mutate();
  };

  const pick = (next: PatientChoice) => {
    setChoice(next);
    setPickerOpen(false);
    if (next?.kind === "new" && !newName) setNewName(search.trim());
  };

  const serverError =
    save.error instanceof ApiError
      ? save.error.message
      : save.error
        ? "Couldn’t reach the clinic server. Make sure the backend is running."
        : null;

  const selectedPatient = (
    <>
      {choice?.kind === "current" && currentName ? (
        <span className="picker-value">
          <span className="picker-avatar">{initials(currentName)}</span>
          <span>
            <strong>{currentName}</strong>
            <small>
              {currentPatient
                ? `${currentPatient.id} · ${currentPatient.phone}`
                : (currentPatientId ?? "Walk-in · no patient record")}
            </small>
          </span>
        </span>
      ) : choice?.kind === "existing" ? (
        <span className="picker-value">
          <span className="picker-avatar">{initials(choice.patient.name)}</span>
          <span>
            <strong>{choice.patient.name}</strong>
            <small>
              {choice.patient.id} · {choice.patient.phone}
            </small>
          </span>
        </span>
      ) : choice?.kind === "new" ? (
        <span className="picker-value">
          <span className="picker-avatar new">
            <UserPlus />
          </span>
          <strong>New patient</strong>
        </span>
      ) : (
        <span className="picker-placeholder">
          {patientsLoading ? "Loading patients…" : "Search by name, phone or patient ID"}
        </span>
      )}
    </>
  );

  return (
    <ValidatedForm onSubmit={submit}>
      {editing && appointment && (
        <div className="status-flow" aria-label="Appointment status">
          <ol>
            {(appointment.status === "Missed"
              ? (["Scheduled", "Missed", "Rescheduled", "Checked in", "Completed"] as const)
              : (["Scheduled", "Rescheduled", "Checked in", "Completed"] as const)
            ).map((step) => (
              <li
                key={step}
                className={cn(
                  step === appointment.status && "current",
                  step === "Missed" && "missed",
                  step === "Rescheduled" &&
                    !appointment.rescheduledAt &&
                    appointment.status !== "Rescheduled" &&
                    "skipped",
                )}
              >
                {step}
              </li>
            ))}
          </ol>
          <div className="status-flow-action">
            <small>
              {appointment.status === "Completed"
                ? "Visit completed — the appointment can no longer be edited. Marked completed by mistake? Revoke it."
                : appointment.status === "Checked in"
                  ? "Patient is here. Mark completed when the visit is done."
                  : appointment.status === "Missed"
                    ? "Not attended on its day. Pick a new date to reschedule, or tick the patient in if they did come."
                    : "Tick the patient in from the day list when they arrive."}
            </small>
            {appointment.status === "Checked in" && onCompleted && (
              <Button type="button" size="sm" onClick={() => setCompleting(true)}>
                <Check />
                Mark completed
              </Button>
            )}
            {appointment.status === "Completed" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={reopen.isPending}
                onClick={() => reopen.mutate(appointment.id)}
              >
                {reopen.isPending ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
                Revoke completion
              </Button>
            )}
          </div>
          {reopen.error && (
            <Banner tone="error">
              {reopen.error instanceof ApiError
                ? reopen.error.message
                : "Couldn’t update the status."}
            </Banner>
          )}
          {appointment.medicines && appointment.medicines.length > 0 && (
            <div className="medicines-given">
              <strong>Medicines given</strong>
              <ul>
                {appointment.medicines.map((m) => (
                  <li key={m.itemId}>
                    <span>
                      {m.name} <small>× {m.quantity}</small>
                    </span>
                    <b>{inrPrice.format(m.unitPrice * m.quantity)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {appointment.prescription && appointment.prescription.length > 0 && (
            <div className="medicines-given">
              <strong>Prescription</strong>
              <ul>
                {appointment.prescription.map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    <span>
                      {p.name} <small>{dosing(p)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {onCompleted && (
            <CompleteVisitDialog
              appointment={appointment}
              open={completing}
              onOpenChange={setCompleting}
              onCompleted={(done, assessment) => {
                setCompleting(false);
                onCompleted(done, assessment);
              }}
            />
          )}
        </div>
      )}
      {appointment?.packageId &&
        appointment.patientId &&
        appointment.packageStep != null &&
        (appointment.status === "Checked in" || appointment.status === "Completed") && (
          <ActualGrafts
            patientId={appointment.patientId}
            packageId={appointment.packageId}
            index={appointment.packageStep}
          />
        )}
      {/* Completed visits are read-only: every field is disabled. */}
      <fieldset className="form-lock" disabled={readOnly}>
        <div className="form-grid mt-4">
          <div className="full patient-picker">
            <span className="picker-label" id="patient-label">
              Patient
            </span>
            {lockedToPackage ? (
              <div className="picker-trigger locked" aria-labelledby="patient-label">
                {selectedPatient}
                <Lock className="picker-chevron" />
              </div>
            ) : (
              <Popover modal open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    aria-labelledby="patient-label"
                    className={`picker-trigger${touched && !choice ? " invalid" : ""}`}
                  >
                    {selectedPatient}
                    <ChevronsUpDown className="picker-chevron" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="picker-popover" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search patients…"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No patient matches “{search}”.</CommandEmpty>
                      {/* Pinned first and always visible, whatever was typed — cmdk hides a group when none of its items match, so the group needs forceMount too. */}
                      <CommandGroup forceMount>
                        <CommandItem
                          value={`__new__ ${search}`}
                          forceMount
                          onSelect={() => pick({ kind: "new" })}
                        >
                          <span className="picker-avatar new">
                            <UserPlus />
                          </span>
                          <span className="picker-item-text">
                            <strong>
                              {search.trim()
                                ? `Add “${search.trim()}” as a new patient`
                                : "Add new patient"}
                            </strong>
                            <small>Just name and phone for now</small>
                          </span>
                        </CommandItem>
                      </CommandGroup>
                      <CommandSeparator alwaysRender />
                      <CommandGroup heading="Existing patients">
                        {(patients ?? []).map((p) => {
                          const selected =
                            (choice?.kind === "existing" && choice.patient.id === p.id) ||
                            (choice?.kind === "current" && appointment?.patientId === p.id);
                          return (
                            <CommandItem
                              key={p.id}
                              value={`${p.name} ${p.id} ${p.phone}`}
                              onSelect={() =>
                                pick(
                                  appointment?.patientId === p.id
                                    ? { kind: "current" }
                                    : { kind: "existing", patient: p },
                                )
                              }
                            >
                              <span className="picker-avatar">{initials(p.name)}</span>
                              <span className="picker-item-text">
                                <strong>{p.name}</strong>
                                <small>
                                  {p.id} · {p.phone}
                                </small>
                              </span>
                              {selected && <Check className="ml-auto" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            {lockedToPackage && (
              <small className="new-patient-note">
                {session
                  ? `Visit ${session.index + 1} of ${session.pkg.steps.length} in ${session.pkg.name} (${packageId})`
                  : `Visit ${(appointment?.packageStep ?? 0) + 1} of package ${packageId}`}{" "}
                — the patient can’t be changed.
                {editing && " Moving it also moves the later visits of the plan."}
              </small>
            )}
            {touched && !choice && (
              <p className="field-error">Choose a patient or add a new one.</p>
            )}
          </div>

          {choice?.kind === "new" && (
            <div className="full new-patient-box">
              <div className="new-patient-head">
                <strong>New patient</strong>
                <button
                  type="button"
                  className="link-reset"
                  onClick={() => setChoice(editing ? { kind: "current" } : null)}
                >
                  <X />
                  {editing ? "Keep current patient" : "Choose existing instead"}
                </button>
              </div>
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Karan Joshi"
                    aria-invalid={touched && !newName.trim()}
                  />
                </label>
                <label>
                  Mobile number
                  <PhoneInput
                    required
                    value={newPhone}
                    onChange={setNewPhone}
                    aria-invalid={touched && !validPhone(newPhone)}
                  />
                </label>
              </div>
              {duplicate ? (
                <div className="duplicate-hint">
                  <span>
                    <strong>{duplicate.name}</strong> ({duplicate.id}) already has this number.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      pick(
                        appointment?.patientId === duplicate.id
                          ? { kind: "current" }
                          : { kind: "existing", patient: duplicate },
                      )
                    }
                  >
                    Use {duplicate.name.split(" ")[0]}
                  </Button>
                </div>
              ) : (
                <small className="new-patient-note">
                  Age, concern and other details can be added later from the patient record.
                </small>
              )}
            </div>
          )}

          <label>
            Date
            <DateInput
              required
              // Past dates stay allowed when editing, e.g. to mark an old visit Completed.
              {...(!editing && { min: clinicToday() })}
              data-error-min="Appointments can’t be booked in the past"
              disabled={locked}
              value={date}
              onChange={setDate}
            />
          </label>
          <label>
            Time
            <TimeInput
              required
              stepMinutes={15}
              {...(checkTime &&
                dayHours && { min: dayHours.opensAt, max: beforeClosing(dayHours.closesAt) })}
              aria-invalid={!!hoursError}
              disabled={locked}
              value={time}
              onChange={setTime}
            />
          </label>
          {hoursError && <p className="full field-error">{hoursError}</p>}
          {reschedulingNow && (
            <p className="full field-hint">
              Saving will mark this appointment <b>Rescheduled</b>.
            </p>
          )}
          {locked && !readOnly && (
            <p className="full field-note">
              The patient is {appointment?.status.toLowerCase()}, so the date and time can’t change.
            </p>
          )}
          <label>
            Treatment
            <SelectInput
              value={treatmentName}
              disabled={!!session}
              onChange={(e) => setTreatmentName(e.target.value)}
            >
              {/* Surgery is only booked from a package, so it isn't offered here
                  (an existing surgery keeps its own name as the current value). */}
              {[
                ...new Set([
                  treatmentName,
                  ...activeTreatments.filter((t) => !t.surgical).map((t) => t.name),
                ]),
              ].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </SelectInput>
            {prpHint ? (
              <small className="treatment-hint">{prpHint}</small>
            ) : (
              !appointment &&
              !session && (
                <small className="field-note">
                  Surgery is booked from the patient’s package (Pending bookings).
                </small>
              )
            )}
          </label>
          <label>
            Doctor
            <SelectInput value={chosenDoctor} onChange={(e) => setDoctor(e.target.value)}>
              {doctorOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </SelectInput>
          </label>
          {isSurgery && (
            <label>
              Surgery length
              <SelectInput value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d} day{d > 1 ? "s" : ""}
                    {date && d > 1 ? ` (until ${untilLabel(date, d)})` : ""}
                  </option>
                ))}
              </SelectInput>
            </label>
          )}
          <label className="full">
            Notes
            <textarea
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — reason for visit, reminders"
            />
          </label>
        </div>
      </fieldset>

      {serverError && (
        <div className="mt-4">
          <Banner tone="error">{serverError}</Banner>
        </div>
      )}

      {editing && onReceivePayment && (
        <button type="button" className="receive-payment-cta" onClick={onReceivePayment}>
          <IndianRupee />
          <span>
            <strong>Receive payment</strong>
            <small>See what’s due and record a payment for this visit</small>
          </span>
          <ChevronRight />
        </button>
      )}

      <DialogFooter className="mt-6 booking-footer">
        {editing && appointment?.patientId && onOpenPatient && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={() => onOpenPatient(appointment.patientId!)}
          >
            <UserRound />
            Open patient record
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={save.isPending || (touched && !canSubmit)}>
            {save.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                {editing ? "Saving…" : "Booking…"}
              </>
            ) : editing ? (
              "Save changes"
            ) : session ? (
              "Book session"
            ) : (
              "Book appointment"
            )}
          </Button>
        )}
      </DialogFooter>
    </ValidatedForm>
  );
}

/** "2 Oct" for the last day of a surgery starting on `date` that lasts `days`. */
function untilLabel(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days - 1);
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** After a plan visit is completed: what's next in the plan ("Schedule surgery" when it's surgery). */
const grafts = new Intl.NumberFormat("en-IN");
const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * The graft count in a package is an estimate; the real number is known once the surgery
 * is under way or done. Updating it reprices the surgery, the package and its bill.
 */
function ActualGrafts({
  patientId,
  packageId,
  index,
}: {
  patientId: string;
  packageId: string;
  index: number;
}) {
  const { data } = usePackages(patientId);
  const step = data?.find((p) => p.id === packageId)?.steps[index];
  const setGrafts = useSetGrafts(patientId);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  if (!step || step.unit !== "graft") return null;

  const count = Number(value);
  const valid = Number.isInteger(count) && count >= 1 && count <= 10_000;
  const changed = valid && count !== step.quantity;
  const save = () =>
    setGrafts.mutate(
      { packageId, index, grafts: count },
      {
        onSuccess: () => {
          setSaved(`Updated to ${grafts.format(count)} grafts.`);
          setValue("");
        },
      },
    );

  return (
    <div className="actual-grafts">
      <div>
        <strong>Actual grafts</strong>
        <small>
          Package: {grafts.format(step.quantity)} grafts ·{" "}
          {step.complimentary ? "complimentary" : rupees.format(step.amount)}
          {!step.complimentary && ` (${rupees.format(step.unitPrice)} per graft)`}
        </small>
      </div>
      <div className="actual-grafts-edit">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={10_000}
          placeholder={String(step.quantity)}
          aria-label="Actual number of grafts"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(null);
            setGrafts.reset();
          }}
        />
        <Button type="button" size="sm" disabled={!changed || setGrafts.isPending} onClick={save}>
          {setGrafts.isPending && <LoaderCircle className="animate-spin" />}
          Update grafts
        </Button>
      </div>
      {changed && !step.complimentary && (
        <small className="actual-grafts-preview">
          New surgery price: {rupees.format(count * step.unitPrice)}
        </small>
      )}
      {saved && <small className="actual-grafts-saved">{saved}</small>}
      {setGrafts.error && (
        <Banner tone="error">
          {setGrafts.error instanceof ApiError
            ? setGrafts.error.message
            : "Couldn’t update the grafts."}
        </Banner>
      )}
    </div>
  );
}

function NextVisitCallout({
  patientId,
  packageId,
  onBook,
}: {
  patientId: string;
  packageId: string;
  onBook: (next: { patientId: string; packageId: string; index: number }) => void;
}) {
  const { data } = usePackages(patientId);
  const pkg = data?.find((p) => p.id === packageId);
  if (!pkg || pkg.status !== "Accepted" || pkg.next === null) return null;
  const step = pkg.steps[pkg.next];
  if (!step) return null;
  return (
    <div className="next-visit">
      <CalendarPlus />
      <div className="min-w-0">
        <strong>
          Next in {pkg.name}: {step.description}
        </strong>
        <small>
          Visit {step.index + 1} of {pkg.steps.length} · due {formatDay(step.dueDate)} (
          {formatDay(step.windowStart)}–{formatDay(step.windowEnd)})
          {step.complimentary && " · complimentary"}
        </small>
      </div>
      {/* Only surgery is scheduled from the package; other visits are booked as normal. */}
      {step.surgery && (
        <Button
          type="button"
          size="sm"
          onClick={() => onBook({ patientId, packageId, index: step.index })}
        >
          Schedule surgery
        </Button>
      )}
    </div>
  );
}
