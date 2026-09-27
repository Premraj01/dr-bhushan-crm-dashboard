import { Checkbox } from "@/components/ui/checkbox";
import { clinicToday } from "@/components/patients/patients-api";
import { ApiError } from "@/lib/api";
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
        onCheckedChange={(value) =>
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
          )
        }
      />
    </span>
  );
}
