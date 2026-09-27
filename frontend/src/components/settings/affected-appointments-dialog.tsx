import { BellRing, CalendarClock, AlertTriangle } from "lucide-react";
import { clinicTimeOf } from "@/components/appointments/appointments-api";
import { formatDay } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AffectedAppointment } from "./affected-appointments";

/**
 * Shown after clinic hours or closures change when upcoming appointments no longer fit:
 * reschedule them from the calendar, or (soon) remind the patients to rebook.
 */
export function AffectedAppointmentsDialog({
  affected,
  onOpenChange,
  onReschedule,
  onSendReminder,
}: {
  affected: AffectedAppointment[];
  onOpenChange: (open: boolean) => void;
  onReschedule: () => void;
  onSendReminder: () => void;
}) {
  const count = affected.length;
  return (
    <Dialog open={count > 0} onOpenChange={onOpenChange}>
      <DialogContent className="affected-dialog">
        <DialogHeader>
          <DialogTitle className="affected-title">
            <AlertTriangle />
            {count} scheduled appointment{count === 1 ? "" : "s"} affected
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? "The clinic is now closed at this time. Reschedule it manually, or send the patient a reminder that the clinic is closed and ask them to rebook."
              : "The clinic is now closed at these times. Reschedule them manually, or send the patients a reminder that the clinic is closed and ask them to rebook."}
          </DialogDescription>
        </DialogHeader>
        <ul className="affected-list">
          {affected.map(({ appointment: a, date, reason }) => (
            <li key={a.id}>
              <div>
                <strong>{a.patientName}</strong>
                <span>
                  {a.type} · {a.doctor}
                </span>
              </div>
              <div className="affected-when">
                <strong>
                  {formatDay(date)} · {clinicTimeOf(a.startsAt)}
                </strong>
                <span>{reason}</span>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onSendReminder}>
            <BellRing />
            Send reminder
          </Button>
          <Button onClick={onReschedule}>
            <CalendarClock />
            Reschedule manually
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
