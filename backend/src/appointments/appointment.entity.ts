import { Entity } from '../common/entity';

/** Internal event: an appointment was booked (PackagesService links it to a package step). */
export const APPOINTMENT_BOOKED = 'appointment.booked';
/** Internal event: a visit was completed (PackagesService closes finished packages). */
export const APPOINTMENT_COMPLETED = 'appointment.completed';
/** Internal event: "Mark completed" was undone (PackagesService reopens the package). */
export const APPOINTMENT_REOPENED = 'appointment.reopened';

/**
 * Scheduled (booked) → Rescheduled (date/time moved before the visit)
 *   → Checked in (patient arrived) → Completed (visit done).
 * Missed: the day passed without a check-in (set automatically after midnight; still editable).
 * Set by the server: booking, rescheduling, check-in and completion — never edited directly.
 */
export const APPOINTMENT_STATUSES = [
  'Scheduled',
  'Rescheduled',
  'Checked in',
  'Completed',
  'Missed',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment extends Entity {
  /** Absent for walk-ins and first consultations that have no patient record yet. */
  patientId?: string;
  patientName: string;
  type: string;
  doctor: string;
  /** ISO 8601 instant. */
  startsAt: string;
  /** Minutes per day. */
  durationMinutes: number;
  /** Consecutive days for multi-day surgery (1–3); absent means a single day. */
  days?: number;
  status: AppointmentStatus;
  notes?: string;
  /** Set when the appointment belongs to a treatment package (null once unlinked). */
  packageId?: string | null;
  /** Index of the package step this visit is for. */
  packageStep?: number | null;
  /** Last time the date/time was moved while still Scheduled/Rescheduled. */
  rescheduledAt?: string;
  checkedInAt?: string | null;
  completedAt?: string | null;
}
