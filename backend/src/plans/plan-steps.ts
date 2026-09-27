import { BadRequestException } from '@nestjs/common';
import type { TreatmentOption } from '../catalog/catalog.entity';
import { addDays, addMonths } from '../common/dates';
import type { PlanItemDto } from './dto/plan-item.dto';
import { Gap, PlanItem, PlanStep, isBlock } from './plan.entity';

/** A plan can't expand to more visits than this. */
export const MAX_PLAN_STEPS = 60;
export const DEFAULT_WINDOW_DAYS = 2;

/** One visit of a plan once repeat blocks are unrolled. */
export interface ExpandedStep extends PlanStep {
  /** Effective gap from the previous visit (null for the first). */
  gap: Gap | null;
  /** e.g. { n: 2, of: 4 } for the second round of a repeat block. */
  cycle?: { n: number; of: number };
}

export function addGap(date: string, gap: Gap): string {
  if (gap.unit === 'months') return addMonths(date, gap.value);
  return addDays(date, gap.unit === 'weeks' ? gap.value * 7 : gap.value);
}

/** Unrolls repeat blocks into the visits, in order. */
export function expandPlan(items: PlanItem[]): ExpandedStep[] {
  const out: ExpandedStep[] = [];
  for (const item of items) {
    if (isBlock(item)) {
      for (let n = 1; n <= item.repeat; n++) {
        for (const step of item.steps) {
          out.push({
            ...step,
            gap: step.gap ?? null,
            ...(item.repeat > 1 && { cycle: { n, of: item.repeat } }),
          });
        }
      }
    } else {
      out.push({ ...item, gap: item.gap ?? null });
    }
  }
  if (out[0]) out[0] = { ...out[0], gap: null };
  return out;
}

/**
 * Validates plan items from a request and stores them in a clean shape: a step has a
 * treatment; a block has steps and a repeat count. Treatments must exist and be active.
 */
export function normalizeItems(
  items: PlanItemDto[],
  treatmentOf: (id: string) => TreatmentOption | undefined,
): PlanItem[] {
  const step = (s: PlanItemDto | PlanStep, where: string): PlanStep => {
    if (!s.treatmentId)
      throw new BadRequestException(`${where}: choose a treatment`);
    const t = treatmentOf(s.treatmentId);
    if (!t) throw new BadRequestException(`${where}: unknown treatment`);
    if (!t.active)
      throw new BadRequestException(`${where}: "${t.name}" is inactive`);
    return {
      treatmentId: s.treatmentId,
      gap: s.gap ? { value: s.gap.value, unit: s.gap.unit } : null,
      windowDays: s.windowDays ?? DEFAULT_WINDOW_DAYS,
      complimentary: s.complimentary ?? false,
      ...(s.unitPrice !== undefined && { unitPrice: s.unitPrice }),
      ...(s.quantity !== undefined && { quantity: s.quantity }),
      ...(s.note?.trim() && { note: s.note.trim() }),
    };
  };
  const out = items.map((item, i): PlanItem => {
    const where = `Item ${i + 1}`;
    if (item.steps) {
      if (item.treatmentId)
        throw new BadRequestException(
          `${where}: a repeat block has steps, not a treatment`,
        );
      return {
        repeat: item.repeat ?? 1,
        steps: item.steps.map((s, j) => step(s, `${where}, step ${j + 1}`)),
      };
    }
    return step(item, where);
  });
  const count = expandPlan(out).length;
  if (count > MAX_PLAN_STEPS) {
    throw new BadRequestException(
      `A plan can have at most ${MAX_PLAN_STEPS} visits (this one has ${count})`,
    );
  }
  return out;
}
