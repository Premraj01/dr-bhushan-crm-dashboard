import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { PackageRequest, PlanItem, PriceLine, StepView } from "@/components/plans/plans-api";

export const GENDERS = ["Male", "Female", "Other"] as const;
export type Gender = (typeof GENDERS)[number];

export type EmergencyContact = { name: string; relationship: string; phone: string };

export type Patient = {
  id: string;
  /** Full name as on the official ID. */
  name: string;
  /** Absent for quick registrations made while booking and older records. */
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** YYYY-MM-DD; when set the server works out `age` from it. */
  dateOfBirth?: string;
  /** Unknown for quick registrations made while booking. */
  age?: number;
  /** Norwood scale for men, Ludwig for women. */
  gender?: Gender;
  /** Mobile — also used for WhatsApp updates and reminders. */
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: EmergencyContact;
  /** Empty until recorded at consultation. */
  concern?: string;
  treatment: string;
  /** YYYY-MM-DD; absent until the first visit. */
  lastVisit?: string;
  notes?: string;
};

/** Accepted as soon as it's created. */
export type PackageStatus = "Accepted" | "Completed" | "Cancelled";

export type PackageLine = PriceLine & { treatmentOptionId: string };

/** A treatment plan applied to a patient: priced steps with live state and due dates. */
export type TreatmentPackage = {
  id: string;
  patientId: string;
  patientName: string;
  /** The plan's name, or "Custom plan". */
  name: string;
  planId?: string;
  /** YYYY-MM-DD the first visit is due. */
  startDate: string;
  items: PlanItem[];
  steps: StepView[];
  lines: PackageLine[];
  total: number;
  status: PackageStatus;
  notes?: string;
  createdBy: { id: string; name: string; role: string };
  createdAt: string;
  progress: { done: number; total: number };
  /** First step still needing a slot (never booked, or missed); null when none. */
  next: number | null;
};

/**
 * The step a new booking of `treatment` will take (mirrors the server): the first step of
 * that treatment still needing a slot, oldest package first.
 */
export function stepForBooking(
  pkgs: TreatmentPackage[],
  treatment: string,
): { pkg: TreatmentPackage; step: StepView } | null {
  const type = treatment.trim().toLowerCase();
  for (const pkg of [...pkgs]
    .filter((p) => p.status === "Accepted")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const step = pkg.steps.find(
      (s) =>
        (s.state === "to-book" || s.state === "missed") &&
        (s.description.toLowerCase() === type ||
          s.description.split(" · ")[0]!.toLowerCase() === type),
    );
    if (step) return { pkg, step };
  }
  return null;
}

/** Refetch `queryKey` whenever any of `events` arrives over the websocket. */
export function useLiveInvalidate(queryKey: readonly unknown[], events: readonly string[]) {
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

export type PatientInput = Partial<Omit<Patient, "id" | "treatment" | "lastVisit">>;

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientInput & Pick<Patient, "phone">) =>
      api<Patient>("/patients", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientInput) =>
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

/**
 * Actual graft count for a package's surgery step, once the patient is checked in or the
 * surgery is done. Reprices the step, the package and the surgery's bill.
 */
export function useSetGrafts(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      packageId,
      index,
      grafts,
    }: {
      packageId: string;
      index: number;
      grafts: number;
    }) =>
      api<TreatmentPackage>(`/packages/${packageId}/sessions/${index}/grafts`, {
        method: "PATCH",
        body: JSON.stringify({ grafts }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["packages", patientId] });
      // The visit is renamed and its bill repriced.
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSetPackageStatus(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<PackageStatus, "Accepted"> }) =>
      api<TreatmentPackage>(`/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["packages", patientId] });
      // Cancelling removes the package's upcoming sessions from the calendar.
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export type BookSessionRequest = {
  startsAt: string;
  doctor: string;
  days?: number;
  notes?: string;
};

/** Books one package session into the appointment calendar. */
export function useBookSession(pkg: Pick<TreatmentPackage, "id" | "patientId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ index, ...body }: BookSessionRequest & { index: number }) =>
      api<TreatmentPackage>(`/packages/${pkg.id}/sessions/${index}/appointment`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["packages", pkg.patientId] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
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
