import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Tone } from "@/components/crm-ui";

export const APPOINTMENT_STATUSES = ["Scheduled", "Checked in", "Completed", "No show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type Appointment = {
  id: string;
  patientId?: string;
  patientName: string;
  type: string;
  doctor: string;
  /** ISO instant */
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
  /** Set when booked from a treatment package. */
  packageId?: string;
};

type TeamMember = {
  id: string;
  name: string;
  role: "Admin" | "Doctor" | "Reception";
  status: string;
};

const TZ = "Asia/Kolkata";

/** Clinic-local YYYY-MM-DD of an instant. */
export function clinicDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

/** Clinic-local "09:30". */
export function clinicTimeOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function appointmentTone(status: AppointmentStatus): Tone {
  if (status === "Completed") return "success";
  if (status === "Checked in") return "warning"; // at the clinic now
  if (status === "No show") return "error";
  return "neutral";
}

/** Appointments for a clinic-local month (YYYY-MM) or day (YYYY-MM-DD); refreshes live. */
export function useAppointments(params: { month: string } | { date: string }) {
  const queryClient = useQueryClient();
  const qs = new URLSearchParams(params).toString();
  const query = useQuery({
    queryKey: ["appointments", params],
    queryFn: () => api<Appointment[]>(`/appointments?${qs}`),
    retry: 1,
  });
  const live = getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    const socket = getSocket();
    const events = ["appointment.created", "appointment.updated", "appointment.deleted"];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [queryClient, live]);
  return query;
}

/** Active doctors (and the lead-doctor admin) that sessions can be booked with. */
export function useDoctors() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamMember[]>("/users"),
    select: (team) => team.filter((m) => m.status === "Active" && m.role !== "Reception"),
    retry: 1,
  });
}
