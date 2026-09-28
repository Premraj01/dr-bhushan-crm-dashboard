import { StatusChip } from "@/components/crm-ui";
import { appointmentTone, paymentChip, type Appointment } from "./appointments-api";

/** The visit's status, plus "Payment pending" once it's completed but not paid in full. */
export function AppointmentChips({ appointment }: { appointment: Appointment }) {
  const payment = paymentChip(appointment);
  const status = (
    <StatusChip tone={appointmentTone(appointment.status)}>{appointment.status}</StatusChip>
  );
  if (!payment) return status;
  return (
    <span className="chip-stack">
      {status}
      <StatusChip tone={payment.tone}>{payment.label}</StatusChip>
    </span>
  );
}
