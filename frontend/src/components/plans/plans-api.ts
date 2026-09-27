import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import type { PricingUnit } from "@/components/settings/catalog-settings";

export type GapUnit = "days" | "weeks" | "months";
/** Time between the previous visit's procedure day and the next one. */
export type Gap = { value: number; unit: GapUnit };

/** One treatment in a plan. Prices are per package (Settings price unless changed). */
export type PlanStep = {
  treatmentId: string;
  /** Gap after the previous visit; ignored for the very first step. */
  gap?: Gap | null;
  /** On time within ± this many days of the due date (not edited in the UI). */
  windowDays?: number;
  complimentary?: boolean;
  /** INR per unit for this package; 0 waives the cost. */
  unitPrice?: number;
  /** Grafts for a per-graft treatment. */
  quantity?: number;
  note?: string;
};

/** Steps done in order, `repeat` times. */
export type PlanBlock = { repeat: number; steps: PlanStep[] };
export type PlanItem = PlanStep | PlanBlock;

export const isBlock = (item: PlanItem): item is PlanBlock => "steps" in item;

export type TreatmentPlan = {
  id: string;
  name: string;
  description?: string;
  items: PlanItem[];
  active: boolean;
  createdBy?: string;
};

/** done · in-clinic (checked in) · booked · missed · to-book (no visit yet). */
export type StepState = "done" | "in-clinic" | "booked" | "missed" | "to-book";

/** One visit of a package (or a quote), with its due date worked out by the server. */
export type StepView = {
  index: number;
  treatmentId: string;
  description: string;
  unit: PricingUnit;
  quantity: number;
  unitPrice: number;
  amount: number;
  complimentary: boolean;
  surgery: boolean;
  gap: Gap | null;
  windowDays: number;
  cycle?: { n: number; of: number };
  note?: string;
  appointmentId?: string;
  state: StepState;
  /** First day of the booked or completed visit. */
  date?: string;
  dueDate: string;
  windowStart: string;
  windowEnd: string;
  /** The previous visit hasn't happened yet — this date moves with it. */
  estimated: boolean;
};

export type PriceLine = {
  description: string;
  unit: PricingUnit;
  quantity: number;
  unitPrice: number;
  amount: number;
  complimentary: boolean;
};

export type PackageRequest = {
  planId?: string;
  name?: string;
  items: PlanItem[];
  startDate?: string;
  notes?: string;
};

export type Quote = {
  name: string;
  startDate: string;
  items: PlanItem[];
  steps: StepView[];
  lines: PriceLine[];
  total: number;
};

export function usePlans() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["plans"],
    queryFn: () => api<TreatmentPlan[]>("/treatment-plans"),
    retry: 1,
  });
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ["plans"] }),
    [queryClient],
  );
  const live = getToken() !== null;
  useSocketEvent("plan.created", refresh, live);
  useSocketEvent("plan.updated", refresh, live);
  useSocketEvent("plan.deleted", refresh, live);
  return query;
}

export function usePlanMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ["plans"] });
  const save = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id?: string | undefined;
      body: Partial<Omit<TreatmentPlan, "id">>;
    }) =>
      api<TreatmentPlan>(id ? `/treatment-plans/${id}` : "/treatment-plans", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/treatment-plans/${id}`, { method: "DELETE" }),
    onSuccess,
  });
  return { save, remove };
}

/** Server-side price and dates for a plan, refreshed as it's edited (null = nothing to price). */
export function useQuote(request: PackageRequest | null) {
  return useQuery({
    queryKey: ["quote", request],
    queryFn: () => api<Quote>("/packages/quote", { method: "POST", body: JSON.stringify(request) }),
    enabled: request !== null && request.items.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    // Always re-price when a preview opens: Settings prices may have changed.
    staleTime: 0,
  });
}

/** "7 days", "1 week", "2 months". */
export function formatGap(gap: Gap): string {
  const unit = gap.value === 1 ? gap.unit.slice(0, -1) : gap.unit;
  return `${gap.value} ${unit}`;
}

/** Visits a plan expands to (repeat blocks unrolled). */
export function visitCount(items: PlanItem[]): number {
  return items.reduce((n, i) => n + (isBlock(i) ? i.repeat * i.steps.length : 1), 0);
}

/** "PRP session × 4 · Derma roller × 8" */
export function planSummary(items: PlanItem[], nameOf: (id: string) => string): string {
  const counts = new Map<string, number>();
  const add = (s: PlanStep, times: number) =>
    counts.set(s.treatmentId, (counts.get(s.treatmentId) ?? 0) + times);
  for (const i of items) {
    if (isBlock(i)) i.steps.forEach((s) => add(s, i.repeat));
    else add(i, 1);
  }
  return [...counts].map(([id, n]) => `${nameOf(id)} × ${n}`).join(" · ");
}
