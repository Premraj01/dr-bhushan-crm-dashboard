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
  };
  prpSessions: { thisMonth: number; completed: number };
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
    ];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [queryClient, live]);
  return query;
}
