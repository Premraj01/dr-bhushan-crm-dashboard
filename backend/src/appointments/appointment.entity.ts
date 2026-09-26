import { Entity } from '../common/entity';

/** Internal event: a package session's appointment moved to another day. */
export const APPOINTMENT_RESCHEDULED = 'appointment.rescheduled';

export const APPOINTMENT_STATUSES = [
  'Scheduled',
  'Checked in',
  'Completed',
  'No show',
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
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
  /** Set when the appointment was booked from a treatment package. */
  packageId?: string;
}
