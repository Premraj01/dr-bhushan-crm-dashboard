import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { TreatmentOption } from "@/components/settings/catalog-settings";

export type Patient = {
  id: string;
  name: string;
  /** Unknown for quick registrations made while booking. */
  age?: number;
  phone: string;
  email?: string;
  /** Empty until recorded at consultation. */
  concern?: string;
  treatment: string;
  /** YYYY-MM-DD; absent until the first visit. */
  lastVisit?: string;
  notes?: string;
};

export type PackageStatus = "Proposed" | "Accepted" | "Completed" | "Cancelled";

export type PackageLine = {
  treatmentOptionId: string;
  description: string;
  unit: "session" | "graft";
  quantity: number;
  unitPrice: number;
  amount: number;
  complimentary: boolean;
};

export type StepKind = "prp" | "transplant" | "prp-free";

export type PackageStep = {
  kind: StepKind;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  complimentary: boolean;
  appointmentId?: string;
};

export type TreatmentPackage = {
  id: string;
  patientId: string;
  lines: PackageLine[];
  prpSessions: number;
  grafts?: number;
  total: number;
  startDate: string;
  intervalMonths: number;
  /** HH:mm the sessions are booked at in the calendar. */
  sessionTime: string;
  doctor: string;
  schedule: PackageStep[];
  status: PackageStatus;
  notes?: string;
  createdBy: { id: string; name: string; role: string };
  createdAt: string;
};

export type PackageRequest = {
  prpSessions?: number;
  transplant?: { grafts: number; pricePerGraft?: number };
  /** YYYY-MM-DD of the first session. */
  startDate?: string;
  intervalMonths?: number;
  sequence?: StepKind[];
  sessionTime?: string;
  doctor?: string;
  notes?: string;
};

/** Refetch `queryKey` whenever any of `events` arrives over the websocket. */
function useLiveInvalidate(queryKey: readonly unknown[], events: readonly string[]) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(queryKey);
  const eventList = events.join("|");
  const live = getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: JSON.parse(key) as unknown[] });
    const socket = getSocket();
    const names = eventList.split("|");
    names.forEach((e) => socket.on(e, refresh));
    return () => names.forEach((e) => socket.off(e, refresh));
  }, [queryClient, key, eventList, live]);
}

export function usePatients() {
  const query = useQuery({
    queryKey: ["patients"],
    queryFn: () => api<Patient[]>("/patients"),
    retry: 1,
  });
  useLiveInvalidate(["patients"], ["patient.created", "patient.updated", "patient.deleted"]);
  return query;
}

export function usePatient(id: string | null) {
  const { data, ...rest } = usePatients();
  return { ...rest, data: id ? data?.find((p) => p.id === id) : undefined };
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<Patient, "id">>) =>
      api<Patient>(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function usePackages(patientId: string | null) {
  const query = useQuery({
    queryKey: ["packages", patientId],
    queryFn: () => api<TreatmentPackage[]>(`/patients/${patientId}/packages`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(["packages", patientId], ["package.created", "package.updated"]);
  return query;
}

export function useCreatePackage(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PackageRequest) =>
      api<TreatmentPackage>(`/patients/${patientId}/packages`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["packages", patientId] });
      // The patient's "current plan" and the calendar are updated server-side.
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useSetPackageStatus(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PackageStatus }) =>
      api<TreatmentPackage>(`/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["packages", patientId] });
      // Accepting/cancelling confirms/cancels the booked sessions.
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

/**
 * Live price preview. Mirrors the backend's PackagesService.quote(); the server
 * recalculates on save, so this is display-only.
 */
export function previewPackage(
  request: PackageRequest,
  prp: TreatmentOption | undefined,
  fue: TreatmentOption | undefined,
) {
  const lines: Omit<PackageLine, "treatmentOptionId">[] = [];
  const paid = request.prpSessions ?? 0;
  let free = 0;
  if (paid > 0 && prp) {
    lines.push({
      description: prp.name,
      unit: "session",
      quantity: paid,
      unitPrice: prp.price,
      amount: paid * prp.price,
      complimentary: false,
    });
  }
  if (request.transplant && fue) {
    const unitPrice = request.transplant.pricePerGraft ?? fue.price;
    const grafts = request.transplant.grafts;
    lines.push({
      description: `${fue.name} · ${grafts.toLocaleString("en-IN")} grafts`,
      unit: "graft",
      quantity: grafts,
      unitPrice,
      amount: grafts * unitPrice,
      complimentary: false,
    });
    free = fue.complimentaryPrpSessions ?? 0;
    if (free > 0 && prp) {
      lines.push({
        description: `${prp.name} · complimentary with transplant`,
        unit: "session",
        quantity: free,
        unitPrice: prp.price,
        amount: 0,
        complimentary: true,
      });
    }
  }
  return {
    lines,
    paidPrp: paid,
    freePrp: free,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  };
}

export function formatVisit(date: string | undefined): string {
  if (!date) return "No visits yet";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  if (date === today) return "Today";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/* ---------- scheduling (mirrors backend PackagesService) ---------- */

/** Today in the clinic's time zone, as YYYY-MM-DD. */
export function clinicToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Adds calendar months to YYYY-MM-DD, clamping to month end (31 Jan + 1 → 28 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export type StepCounts = Record<StepKind, number>;

/** Default order: transplant, its complimentary PRP, then paid PRP. */
export function defaultSequence(counts: StepCounts): StepKind[] {
  return (["transplant", "prp-free", "prp"] as const).flatMap((k) =>
    Array<StepKind>(counts[k]).fill(k),
  );
}

/**
 * Keeps the user's arrangement when quantities change: surplus steps are dropped
 * from the end of their kind, new ones are added where the default order puts them.
 */
export function reconcileSequence(current: StepKind[], counts: StepCounts): StepKind[] {
  const seen: Partial<Record<StepKind, number>> = {};
  const kept = current.filter((k) => (seen[k] = (seen[k] ?? 0) + 1) <= counts[k]);
  const missing = (k: StepKind) => counts[k] - kept.filter((x) => x === k).length;
  const result = [...kept];
  if (missing("transplant") > 0) result.unshift("transplant");
  if (missing("prp-free") > 0) {
    // After the transplant (or at the start) — that's when complimentary PRP happens.
    const at = result.indexOf("transplant") + 1;
    result.splice(at, 0, ...Array<StepKind>(missing("prp-free")).fill("prp-free"));
  }
  if (missing("prp") > 0) result.push(...Array<StepKind>(missing("prp")).fill("prp"));
  return result;
}

export function buildSchedule(opts: {
  sequence: StepKind[];
  counts: StepCounts;
  prpName: string;
  transplant: string | undefined;
  startDate: string;
  intervalMonths: number;
}): PackageStep[] {
  const seen: StepCounts = { prp: 0, transplant: 0, "prp-free": 0 };
  return opts.sequence.map((kind, i) => {
    const n = ++seen[kind];
    const description =
      kind === "transplant"
        ? (opts.transplant ?? "Hair transplant")
        : kind === "prp"
          ? `${opts.prpName} ${n} of ${opts.counts.prp}`
          : `${opts.prpName} ${n} of ${opts.counts["prp-free"]} · complimentary`;
    return {
      kind,
      description,
      date: addMonths(opts.startDate, i * opts.intervalMonths),
      complimentary: kind === "prp-free",
    };
  });
}

/** "Today", "Tomorrow", "27 Dec", or "27 Mar 2027" outside the current year. */
export function formatDay(date: string): string {
  const today = clinicToday();
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${date}T00:00:00`);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
