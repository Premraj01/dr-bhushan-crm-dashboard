import { useState, type FormEvent } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { PhoneInput } from "@/components/form/phone-input";
import { ValidatedForm } from "@/components/form/validated-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clinicToday, usePatients } from "@/components/patients/patients-api";
import { ApiError, errorText } from "@/lib/api";
import { isValidMobile, phoneDigits } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  clinicDateOf,
  clinicTimeOf,
  useAppointmentStatus,
  type Appointment,
} from "./appointments-api";

/**
 * Tick when the patient arrives (→ Checked in); untick to undo a mistake.
 * Only on the day of the appointment (or later), and not once the visit is completed.
 * A walk-in with no patient record is registered first (name + mobile number).
 */
export function CheckInTick({
  appointment: a,
  onNotice,
  className,
}: {
  appointment: Appointment;
  onNotice?: ((message: string) => void) | undefined;
  className?: string;
}) {
  const { checkIn } = useAppointmentStatus();
  const [registering, setRegistering] = useState(false);
  const checked = a.status === "Checked in" || a.status === "Completed";
  const future = clinicDateOf(a.startsAt) > clinicToday();
  const completed = a.status === "Completed";
  const hint = completed
    ? "Visit completed"
    : future
      ? "Patients can be checked in on the day of the appointment"
      : checked
        ? "Checked in — untick to undo"
        : "Tick when the patient arrives";

  return (
    <span className={cn("checkin-tick", checked && "checked", className)} title={hint}>
      <Checkbox
        checked={checked}
        disabled={completed || future || checkIn.isPending}
        aria-label={
          checked
            ? `${a.patientName} checked in — untick to undo`
            : `Check in ${a.patientName} (${clinicTimeOf(a.startsAt)})`
        }
        onCheckedChange={(value) => {
          if (value === true && !a.patientId) return setRegistering(true);
          checkIn.mutate(
            { id: a.id, undo: value !== true },
            {
              onSuccess: () =>
                onNotice?.(
                  value === true
                    ? `${a.patientName} checked in for ${a.type} at ${clinicTimeOf(a.startsAt)}.`
                    : `Check-in undone for ${a.patientName}.`,
                ),
              onError: (error) =>
                onNotice?.(
                  error instanceof ApiError ? error.message : "Couldn’t update the check-in.",
                ),
            },
          );
        }}
      />
      <Dialog open={registering} onOpenChange={setRegistering}>
        <DialogContent>
          {registering && (
            <RegisterWalkIn
              appointment={a}
              onCancel={() => setRegistering(false)}
              onDone={(message) => {
                setRegistering(false);
                onNotice?.(message);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** Same number regardless of spaces, dashes or a +91 prefix (matches the backend). */
const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);

/** Walk-in arrived: create their patient record (or link the one with this number) and check in. */
function RegisterWalkIn({
  appointment: a,
  onCancel,
  onDone,
}: {
  appointment: Appointment;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const { checkIn } = useAppointmentStatus();
  const { data: patients } = usePatients();
  const [name, setName] = useState(a.patientName);
  const [phone, setPhone] = useState("");
  const valid = name.trim().length > 0 && isValidMobile(phoneDigits(phone));
  const existing =
    phoneKey(phone).length === 10
      ? patients?.find((p) => phoneKey(p.phone) === phoneKey(phone))
      : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The tick can sit inside other forms (appointment details); keep this submit here.
    e.stopPropagation();
    if (!valid) return;
    checkIn.mutate(
      { id: a.id, newPatient: { name: name.trim(), phone: phone.trim() } },
      {
        onSuccess: (done) =>
          onDone(
            `${done.patientName} checked in for ${a.type} at ${clinicTimeOf(a.startsAt)} — ` +
              (existing
                ? `linked to their record (${done.patientId}).`
                : `patient record ${done.patientId} created.`),
          ),
      },
    );
  };

  return (
    <ValidatedForm onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Check in & register patient</DialogTitle>
        <DialogDescription>
          {a.patientName} has no patient record yet. Add their mobile number to create one — the
          visit, photos and prescriptions are then kept in their history.
        </DialogDescription>
      </DialogHeader>
      <div className="form-grid mt-4">
        <label>
          Full name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Karan Joshi"
          />
        </label>
        <label>
          Mobile number
          <PhoneInput autoFocus required value={phone} onChange={setPhone} />
        </label>
      </div>
      <small className="new-patient-note mt-2 block">
        {existing
          ? `${existing.name} (${existing.id}) already has this number — the visit will be linked to their record.`
          : "Age, concern and other details can be added later from the patient record."}
      </small>
      {checkIn.error && <Banner tone="error">{errorText(checkIn.error)}</Banner>}
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={checkIn.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={checkIn.isPending}>
          {checkIn.isPending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
          {existing ? "Link & check in" : "Register & check in"}
        </Button>
      </DialogFooter>
    </ValidatedForm>
  );
}
