import { Entity } from '../common/entity';

export const TREATMENT_TYPES = ['PRP', 'Transplant', 'Consultation'] as const;
export const TREATMENT_STATUSES = [
  'Active',
  'Recovery',
  'Review due',
  'Completed',
] as const;
export type TreatmentType = (typeof TREATMENT_TYPES)[number];
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export interface Treatment extends Entity {
  patientId?: string;
  patientName: string;
  type: TreatmentType;
  /** Plan / procedure summary, e.g. "Session 3 of 6" or "3,200 grafts · Norwood IV". */
  plan: string;
  sessionsCompleted?: number;
  sessionsTotal?: number;
  grafts?: number;
  /** YYYY-MM-DD */
  lastSessionAt: string;
  outcome?: string;
  status: TreatmentStatus;
}
