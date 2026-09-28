import { Entity } from '../common/entity';
import { type PricingUnit } from '../catalog/catalog.entity';
import { type Gap, type PlanItem } from '../plans/plan.entity';
import { type Role } from '../users/user.entity';

/** A package is accepted as soon as it's created. */
export const PACKAGE_STATUSES = ['Accepted', 'Completed', 'Cancelled'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** Price summary: steps of the same treatment and price grouped together. */
export interface PackageLine {
  /** Settings → Treatments entry this line was priced from. */
  treatmentOptionId: string;
  description: string;
  unit: PricingUnit;
  quantity: number;
  /** INR per unit for this package (the Settings price unless the doctor changed it). */
  unitPrice: number;
  /** quantity × unitPrice, or 0 for complimentary lines. */
  amount: number;
  complimentary: boolean;
}

/**
 * One visit of the package's plan, in order. Its due date isn't stored: it's worked out
 * from the previous visit's actual procedure day plus `gap` (see PackagesService.view).
 */
export interface PackageStep {
  treatmentId: string;
  /** e.g. "PRP session" or "FUE hair transplant · 2,500 grafts". */
  description: string;
  unit: PricingUnit;
  quantity: number;
  unitPrice: number;
  /** What this visit is billed: quantity × unitPrice, or 0 when complimentary. */
  amount: number;
  complimentary: boolean;
  /** A surgical treatment: 1–3 days, blocks the theatre, scheduled via Pending bookings. */
  surgery: boolean;
  /** Gap after the previous visit; null for the first. */
  gap: Gap | null;
  windowDays: number;
  /** e.g. "Round 2 of 4" inside a repeat block. */
  cycle?: { n: number; of: number };
  note?: string;
  /** The booked visit, once there is one. */
  appointmentId?: string;
  /**
   * Grafts actually transplanted, entered once the surgery is under way or done
   * (PackagesService.setGrafts). `quantity` before then is only the estimate.
   */
  actualGrafts?: number;
}

/** A treatment plan applied to a patient, with its prices. */
export interface TreatmentPackage extends Entity {
  patientId: string;
  patientName: string;
  /** The plan's name, or "Custom plan". */
  name: string;
  planId?: string;
  /** YYYY-MM-DD the first visit is due. */
  startDate: string;
  /** The plan as priced for this patient (steps and repeat blocks). */
  items: PlanItem[];
  steps: PackageStep[];
  lines: PackageLine[];
  /** INR, whole rupees. */
  total: number;
  status: PackageStatus;
  notes?: string;
  createdBy: { id: string; name: string; role: Role };
}
