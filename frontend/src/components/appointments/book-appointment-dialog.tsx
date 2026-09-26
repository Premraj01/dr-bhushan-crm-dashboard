import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Lock, LoaderCircle, UserPlus, UserRound, X } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { usePatients, clinicToday, type Patient } from "@/components/patients/patients-api";
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
import { getSessionUser, initials } from "@/lib/mock-auth";
import {
  APPOINTMENT_STATUSES,
  clinicDateOf,
  clinicTimeOf,
  useDoctors,
  type Appointment,
  type AppointmentStatus,
} from "./appointments-api";

/** "current" keeps the appointment's patient as-is when editing (including walk-ins with no record). */
type PatientChoice =
  { kind: "current" } | { kind: "existing"; patient: Patient } | { kind: "new" } | null;

const PHONE = /^\+?[0-9][0-9 -]{6,19}$/;
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

/** Books a new appointment, or edits `appointment` when one is given. */
export function AppointmentDialog({
  open,
  appointment,
  defaultDate,
  onOpenChange,
  onSaved,
  onOpenPatient,
}: {
  open: boolean;
  appointment?: Appointment | null | undefined;
  defaultDate?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: AppointmentSaved) => void;
  onOpenPatient?: ((id: string) => void) | undefined;
}) {
  const editing = !!appointment;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="booking-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit appointment" : "Book appointment"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Reschedule, change the patient, doctor or treatment, or update the status."
              : "Pick an existing patient or add a new one with just a name and phone number."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount per opening so the form starts fresh. */}
        {open && (
          <AppointmentForm
            key={appointment?.id ?? "new"}
            appointment={appointment ?? undefined}
            defaultDate={defaultDate ?? clinicToday()}
            onCancel={() => onOpenChange(false)}
            onSaved={onSaved}
            onOpenPatient={onOpenPatient}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentForm({
  appointment,
  defaultDate,
  onCancel,
  onSaved,
  onOpenPatient,
}: {
  appointment: Appointment | undefined;
  defaultDate: string;
  onCancel: () => void;
  onSaved: (result: AppointmentSaved) => void;
  onOpenPatient?: ((id: string) => void) | undefined;
}) {
  const editing = appointment !== undefined;
  const lockedToPackage = !!appointment?.packageId;
  const queryClient = useQueryClient();
  const { data: patients, isPending: patientsLoading } = usePatients();
  const { data: treatments } = useCatalog<TreatmentOption>("treatments");
  const { data: doctors } = useDoctors();
  const activeTreatments = (treatments ?? []).filter((t) => t.active);
  const currentPatient = appointment?.patientId
    ? patients?.find((p) => p.id === appointment.patientId)
    : undefined;

  const [choice, setChoice] = useState<PatientChoice>(editing ? { kind: "current" } : null);
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
  const [treatmentName, setTreatmentName] = useState(appointment?.type ?? "Consultation");
  const [doctor, setDoctor] = useState(() => {
    if (appointment) return appointment.doctor;
    const me = getSessionUser();
    return me.role === "Reception" ? "" : me.name;
  });
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? "Scheduled");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [touched, setTouched] = useState(false);

  const doctorOptions = [...new Set([doctor, ...(doctors ?? []).map((d) => d.name)])].filter(
    Boolean,
  );
  const chosenDoctor = doctor || doctorOptions[0] || "";
  const treatment = activeTreatments.find((t) => t.name === treatmentName);
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
    mutationFn: () => {
      const startsAt = `${date}T${time}:00+05:30`;
      if (!appointment) {
        return api<Appointment>("/appointments", {
          method: "POST",
          body: JSON.stringify({
            ...patientPart(),
            type: treatmentName,
            doctor: chosenDoctor,
            startsAt,
            durationMinutes: slotMinutes(treatment),
            ...(notes.trim() && { notes: notes.trim() }),
          }),
        });
      }
      const treatmentChanged = treatmentName !== appointment.type;
      return api<Appointment>(`/appointments/${appointment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...patientPart(),
          type: treatmentName,
          doctor: chosenDoctor,
          startsAt,
          status,
          notes: notes.trim(),
          // Keep the existing slot length unless the treatment itself changed.
          ...(treatmentChanged && treatment && { durationMinutes: slotMinutes(treatment) }),
        }),
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      // Rescheduling a package session also moves it in the package's timeline.
      if (saved.packageId) void queryClient.invalidateQueries({ queryKey: ["packages"] });
      if (choice?.kind === "new") void queryClient.invalidateQueries({ queryKey: ["patients"] });
      onSaved({ appointment: saved, isNewPatient: choice?.kind === "new", edited: editing });
    },
  });

  const newPatientValid = newName.trim().length > 0 && PHONE.test(newPhone.trim());
  const patientReady =
    choice?.kind === "current" ||
    choice?.kind === "existing" ||
    (choice?.kind === "new" && newPatientValid && !duplicate);
  const canSubmit = patientReady && !!date && !!time && !!chosenDoctor && !save.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
      {choice?.kind === "current" && appointment ? (
        <span className="picker-value">
          <span className="picker-avatar">{initials(appointment.patientName)}</span>
          <span>
            <strong>{appointment.patientName}</strong>
            <small>
              {currentPatient
                ? `${currentPatient.id} · ${currentPatient.phone}`
                : (appointment.patientId ?? "Walk-in · no patient record")}
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
    <form onSubmit={submit} noValidate>
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
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
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
              Session of package {appointment?.packageId} — the patient can’t be changed.
              Rescheduling also moves it in the package timeline.
            </small>
          )}
          {touched && !choice && <p className="field-error">Choose a patient or add a new one.</p>}
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
                <input
                  required
                  inputMode="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+91 98xxx xxxxx"
                  aria-invalid={touched && !PHONE.test(newPhone.trim())}
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
          <input
            required
            type="date"
            // Past dates stay allowed when editing, e.g. to mark an old visit Completed.
            {...(!editing && { min: clinicToday() })}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Time
          <input
            required
            type="time"
            step={900}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label>
          Treatment
          <select value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)}>
            {[...new Set([treatmentName, ...activeTreatments.map((t) => t.name)])].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Doctor
          <select value={chosenDoctor} onChange={(e) => setDoctor(e.target.value)}>
            {doctorOptions.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {editing && (
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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

      {serverError && (
        <div className="mt-4">
          <Banner tone="error">{serverError}</Banner>
        </div>
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
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || (touched && !canSubmit)}>
          {save.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              {editing ? "Saving…" : "Booking…"}
            </>
          ) : editing ? (
            "Save changes"
          ) : (
            "Book appointment"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
