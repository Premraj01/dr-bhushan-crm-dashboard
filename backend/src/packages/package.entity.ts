import { Entity } from '../common/entity';
import { type PricingUnit } from '../catalog/catalog.entity';
import { type Role } from '../users/user.entity';

export const PACKAGE_STATUSES = [
  'Proposed',
  'Accepted',
  'Completed',
  'Cancelled',
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export interface PackageLine {
  /** Settings → Treatments entry this line was priced from. */
  treatmentOptionId: string;
  description: string;
  unit: PricingUnit;
  quantity: number;
  /** INR per unit at the time the package was created. */
  unitPrice: number;
  /** quantity × unitPrice, or 0 for complimentary lines. */
  amount: number;
  complimentary: boolean;
}

/** One scheduled visit in a package: paid PRP, the transplant, or a complimentary PRP. */
export const STEP_KINDS = ['prp', 'transplant', 'prp-free'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface PackageStep {
  kind: StepKind;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  complimentary: boolean;
  /** Appointment booked in the calendar for this session. */
  appointmentId?: string;
}

/** A treatment package proposed to a patient after consultation. */
export interface TreatmentPackage extends Entity {
  patientId: string;
  patientName: string;
  lines: PackageLine[];
  /** Paid + complimentary PRP sessions in the package. */
  prpSessions: number;
  grafts?: number;
  /** INR, whole rupees. */
  total: number;
  /** Date of the first session (YYYY-MM-DD). */
  startDate: string;
  /** Months between consecutive sessions. */
  intervalMonths: number;
  /** Clinic-local start time for every session (HH:mm). */
  sessionTime: string;
  doctor: string;
  /** Sessions in the order they'll happen; drives the patient's treatment timeline. */
  schedule: PackageStep[];
  status: PackageStatus;
  notes?: string;
  createdBy: { id: string; name: string; role: Role };
}
