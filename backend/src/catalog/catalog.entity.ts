import { Entity } from '../common/entity';
import { type TreatmentType } from '../treatments/treatment.entity';

export const PRICING_UNITS = ['session', 'graft'] as const;
export const DURATION_UNITS = ['minutes', 'hours', 'days'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type PricingUnit = (typeof PRICING_UNITS)[number];

/** A service the clinic offers, managed in Settings → Treatments. */
export interface TreatmentOption extends Entity {
  name: string;
  category: TreatmentType;
  /** Sessions included in the plan, e.g. 1 for a single PRP session. */
  sessions?: number;
  /** INR, whole rupees, per `pricingUnit` (e.g. ₹20 per graft for FUE). */
  price: number;
  pricingUnit: PricingUnit;
  /** PRP sessions given free with this treatment (e.g. 3 with a transplant). */
  complimentaryPrpSessions?: number;
  /** How long it takes, e.g. 45 minutes or 1–2 days (`durationMax` for a range). */
  duration: number;
  durationMax?: number | null;
  durationUnit: DurationUnit;
  description?: string;
  active: boolean;
}

/** Built-in drawings the frontend can show for a concern (Norwood scale stages, etc.). */
export const CONCERN_ILLUSTRATIONS = [
  'norwood-1',
  'norwood-2',
  'norwood-3',
  'norwood-3v',
  'norwood-4',
  'norwood-5',
  'norwood-6',
  'norwood-7',
  'alopecia-areata',
] as const;
export type ConcernIllustration = (typeof CONCERN_ILLUSTRATIONS)[number];

/** A presenting concern patients can be tagged with, managed in Settings → Concerns. */
export interface ConcernOption extends Entity {
  name: string;
  description?: string;
  illustration?: ConcernIllustration;
  active: boolean;
}
