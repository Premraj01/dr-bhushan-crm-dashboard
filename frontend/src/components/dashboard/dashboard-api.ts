import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";

/** GET /api/dashboard/summary — every figure comes from live records. */
export type DashboardSummary = {
  /** Clinic-local YYYY-MM-DD and YYYY-MM the figures are for. */
  today: string;
  month: string;
  patients: { total: number; newThisMonth: number };
  appointmentsToday: { total: number; scheduled: number; checkedIn: number; completed: number };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    today: number;
    billedThisMonth: number;
    outstanding: number;
    /** Completed visits not yet paid in full, and what's still owed on them. */
    unpaidVisits: { count: number; amount: number };
  };
  prpSessions: { thisMonth: number; completed: number };
  /** This month's completed surgeries; grafts only from the count entered after surgery. */
  grafts: {
    surgeries: number;
    /** Completed surgeries still missing their graft count. */
    awaitingCount: number;
    total: number;
    /** Per surgery with a graft count (0 when none). */
    average: number;
  };
  treatmentMix: {
    total: number;
    prp: number;
    transplant: number;
    consultation: number;
    other: number;
  };
  openLeads: number;
};

/** Refetches whenever patients, appointments, invoices or payments change. */
export function useDashboardSummary() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api<DashboardSummary>("/dashboard/summary"),
    retry: 1,
  });
  const live = getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    const socket = getSocket();
    const events = [
      "patient.created",
      "patient.updated",
      "appointment.created",
      "appointment.updated",
      "appointment.deleted",
      "payment.created",
      "invoice.created",
      "invoice.updated",
      "invoice.deleted",
      "package.updated", // graft count set after surgery
    ];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [queryClient, live]);
  return query;
}
