import type { PrescribedItem } from "@/components/appointments/appointments-api";

export const FREQUENCIES = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "At night (HS)",
  "Alternate days",
  "Twice a week",
  "Once a week",
  "As needed (SOS)",
];

/** Course lengths offered; anything else can be typed as days. */
export const DURATIONS = [3, 5, 7, 10, 14, 30, 60, 90, 180];

/** Common hair-clinic prescriptions, suggested when typing a medicine name. */
export const COMMON_PRESCRIPTIONS = [
  "Finasteride 1 mg",
  "Dutasteride 0.5 mg",
  "Minoxidil 5% solution",
  "Minoxidil 2% solution",
  "Minoxidil 2.5 mg (oral)",
  "Biotin 10 mg",
  "Ketoconazole 2% shampoo",
  "Cefuroxime 500 mg",
  "Amoxicillin-clavulanate 625 mg",
  "Prednisolone 20 mg",
  "Paracetamol 650 mg",
  "Saline spray",
  "Multivitamin with zinc",
];

export function durationLabel(days: number | undefined): string {
  if (days === undefined) return "Ongoing";
  if (days % 30 === 0 && days >= 30) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "1 tablet · Once daily (OD) · 3 months". */
export function dosing(item: Pick<PrescribedItem, "dose" | "frequency" | "durationDays">): string {
  return [item.dose, item.frequency, durationLabel(item.durationDays)].filter(Boolean).join(" · ");
}

/** Editable prescription line; `duration` is "" for ongoing. */
export type RxDraft = {
  name: string;
  itemId?: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export const blankRx = (name: string, itemId?: string): RxDraft => ({
  name,
  ...(itemId && { itemId }),
  dose: "",
  frequency: "",
  duration: "",
  instructions: "",
});

export function toPrescribed(d: RxDraft): PrescribedItem {
  const t = (v: string) => v.trim() || undefined;
  const dose = t(d.dose);
  const frequency = t(d.frequency);
  const instructions = t(d.instructions);
  return {
    name: d.name.trim(),
    ...(d.itemId && { itemId: d.itemId }),
    ...(dose && { dose }),
    ...(frequency && { frequency }),
    ...(d.duration && { durationDays: Number(d.duration) }),
    ...(instructions && { instructions }),
  };
}
