import { Entity } from '../common/entity';

export const GAP_UNITS = ['days', 'weeks', 'months'] as const;
export type GapUnit = (typeof GAP_UNITS)[number];

/** Time between the previous step's procedure day and this step, e.g. 7 days or 2 months. */
export interface Gap {
  value: number;
  unit: GapUnit;
}

/** One treatment in a plan. */
export interface PlanStep {
  /** Settings → Treatments entry. */
  treatmentId: string;
  /** Gap after the previous step; ignored for the very first step of a plan. */
  gap?: Gap | null;
  /** Reminder window: the step is "on time" within ± this many days of its due date. */
  windowDays?: number;
  /** Given free (e.g. the PRP sessions that come with a transplant). */
  complimentary?: boolean;
  /** INR per unit; defaults to the Settings price. Set per package to change or waive a cost. */
  unitPrice?: number;
  /** Units billed, e.g. grafts for a per-graft treatment. Defaults to 1. */
  quantity?: number;
  note?: string;
}

/** Steps done in order, `repeat` times (e.g. PRP → roller → roller, × 4). */
export interface PlanBlock {
  repeat: number;
  steps: PlanStep[];
}

export type PlanItem = PlanStep | PlanBlock;

export function isBlock(item: PlanItem): item is PlanBlock {
  return 'steps' in item;
}

/** A reusable combination of treatments, managed in Settings → Treatment plans. */
export interface TreatmentPlan extends Entity {
  name: string;
  description?: string;
  items: PlanItem[];
  active: boolean;
  createdBy?: string;
}
