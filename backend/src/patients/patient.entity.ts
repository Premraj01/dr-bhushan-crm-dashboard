import { Entity } from '../common/entity';

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export type Gender = (typeof GENDERS)[number];

export interface EmergencyContact {
  name: string;
  /** e.g. "Spouse", "Father". */
  relationship: string;
  phone: string;
}

export interface Patient extends Entity {
  /** Full name as on the official ID; built from the name parts when they are given. */
  name: string;
  /** Absent for quick registrations made while booking and older records. */
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** YYYY-MM-DD. When set, `age` is worked out from it on every read. */
  dateOfBirth?: string;
  /** Unknown for quick registrations made while booking. */
  age?: number;
  /** Decides the hair-loss scale: Norwood for men, Ludwig for women. */
  gender?: Gender;
  /** Mobile number, also used for WhatsApp updates and appointment reminders. */
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: EmergencyContact;
  /** Recorded at consultation; empty for quick registrations. */
  concern?: string;
  /** Current plan summary, e.g. "PRP · Session 3/6". */
  treatment: string;
  /** YYYY-MM-DD; absent until the patient's first visit. */
  lastVisit?: string;
  notes?: string;
}
