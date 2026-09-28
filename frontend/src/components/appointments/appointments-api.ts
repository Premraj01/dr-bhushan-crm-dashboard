import { useEffect } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Tone } from "@/components/crm-ui";

/**
 * Scheduled → Rescheduled → Checked in → Completed; set by booking, rescheduling, check-in and
 * "Mark completed". A visit not attended by midnight becomes Missed (still editable).
 */
export const APPOINTMENT_STATUSES = [
  "Scheduled",
  "Rescheduled",
  "Checked in",
  "Completed",
  "Missed",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type Appointment = {
  id: string;
  patientId?: string;
  patientName: string;
  type: string;
  doctor: string;
  /** ISO instant */
  startsAt: string;
  /** Minutes per day. */
  durationMinutes: number;
  /** Consecutive days for multi-day surgery (1–3). */
  days?: number;
  status: AppointmentStatus;
  notes?: string;
  /** Set when the visit belongs to a treatment package (null once unlinked). */
  packageId?: string | null;
  /** Index of the package step this visit is for. */
  packageStep?: number | null;
  rescheduledAt?: string;
  checkedInAt?: string | null;
  completedAt?: string | null;
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
  if (status === "Checked in") return "info"; // at the clinic now
  if (status === "Rescheduled") return "warning";
  if (status === "Missed") return "error";
  return "neutral";
}

/** Booked and not yet attended. */
export const isUpcoming = (a: Pick<Appointment, "status">) =>
  a.status === "Scheduled" || a.status === "Rescheduled";

/** Not attended yet and still editable: upcoming, or Missed. */
export const isOpen = (a: Pick<Appointment, "status">) => isUpcoming(a) || a.status === "Missed";

/** Check-in tick (POST) and undo (DELETE), and "Mark completed" (and revoking it). */
export function useAppointmentStatus() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["patients"] }); // last visit
    void queryClient.invalidateQueries({ queryKey: ["packages"] }); // progress, auto-complete
  };
  const checkIn = useMutation({
    mutationFn: ({ id, undo }: { id: string; undo?: boolean }) =>
      api<Appointment>(`/appointments/${id}/check-in`, { method: undo ? "DELETE" : "POST" }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (id: string) =>
      api<Appointment>(`/appointments/${id}/complete`, { method: "POST" }),
    onSuccess: refresh,
  });
  // Undo "Mark completed": back to Checked in (reopens a package it had completed).
  const reopen = useMutation({
    mutationFn: (id: string) =>
      api<Appointment>(`/appointments/${id}/complete`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return { checkIn, complete, reopen };
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

/** Appointments across a fixed set of clinic-local months, for overview calendars. */
export function useAppointmentMonths(months: string[], enabled = true) {
  const queryClient = useQueryClient();
  const queries = useQueries({
    queries: months.map((month) => ({
      queryKey: ["appointments", { month }],
      queryFn: () => api<Appointment[]>(`/appointments?month=${month}`),
      enabled,
      retry: 1,
    })),
  });
  const live = enabled && getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    const socket = getSocket();
    const events = ["appointment.created", "appointment.updated", "appointment.deleted"];
    events.forEach((event) => socket.on(event, refresh));
    return () => events.forEach((event) => socket.off(event, refresh));
  }, [queryClient, live]);

  // A multi-day surgery spanning two months comes back in both; keep it once.
  const byId = new Map<string, Appointment>();
  for (const query of queries) for (const a of query.data ?? []) byId.set(a.id, a);

  return {
    data: [...byId.values()],
    isPending: enabled && queries.some((query) => query.isPending),
    isError: enabled && queries.some((query) => query.isError),
    isRefetching: queries.some((query) => query.isRefetching),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
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

/** A package whose surgery is waiting for a slot (see GET /api/packages/pending). */
export type PendingBooking = {
  packageId: string;
  patientId: string;
  patientName: string;
  status: "Accepted" | "Completed" | "Cancelled";
  createdAt: string;
  createdBy: string;
  /** Step index of the surgery in the package. */
  stepIndex: number;
  /** e.g. "FUE hair transplant · 2,000 grafts" */
  surgery: string;
  /** The surgery was booked but the patient didn't come — it needs a new slot. */
  missed: boolean;
};

/** Surgeries waiting for a slot: missed ones first, then longest waiting. Refreshes live. */
export function usePendingBookings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["packages", "pending"],
    queryFn: () => api<PendingBooking[]>("/packages/pending"),
    retry: 1,
  });
  const live = getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["packages", "pending"] });
    const socket = getSocket();
    const events = [
      "package.created",
      "package.updated",
      "appointment.created",
      "appointment.updated",
    ];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [queryClient, live]);
  return query;
}

export const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank transfer", "Cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Payment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  receivedBy: { id: string; name: string };
  /** When the money was received (ISO). */
  receivedAt: string;
  createdAt: string;
};

/** What's owed for an appointment (the whole package for package sessions). */
export type AppointmentBill = {
  appointmentId?: string;
  patientName: string;
  /** YYYY-MM-DD the invoice was issued. */
  issuedAt?: string;
  source: "package" | "visit";
  packageId?: string;
  invoiceId?: string;
  description: string;
  total: number;
  paid: number;
  balance: number;
  status: "Paid" | "Partially paid" | "Pending" | "Overdue" | "Cancelled" | "Not billed";
  /** The visit's price isn't in Settings — enter it with the first payment. */
  needsCharge: boolean;
  /** A package's complimentary session: nothing to pay. */
  complimentary: boolean;
  payments: Payment[];
  /** "emi" when the balance is being paid in installments. */
  plan: "full" | "emi";
  installments: Installment[];
};

export type Installment = {
  number: number;
  dueDate: string;
  amount: number;
  /** Received towards this installment (payments fill installments in order). */
  paid: number;
  status: "Paid" | "Part paid" | "Due" | "Overdue" | "Upcoming";
};

export type EmiPlanRequest = {
  installments: { dueDate: string; amount: number }[];
  charge?: number;
};

/**
 * A bill is addressed by path: "/appointments/APT-501" (from the calendar) or
 * "/invoices/INV-26089" (from the Billing page). Both support the same actions.
 */
export type BillPath = `/appointments/${string}` | `/invoices/${string}`;

/** Sets up EMIs for the balance (PUT) or removes them (DELETE). */
export function useEmiPlan(billPath: BillPath) {
  const queryClient = useQueryClient();
  const onSuccess = (bill: AppointmentBill) => {
    queryClient.setQueryData(["billing", billPath], bill);
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
  };
  const save = useMutation({
    mutationFn: (body: EmiPlanRequest) =>
      api<AppointmentBill>(`${billPath}/billing/emi`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
  const clear = useMutation({
    mutationFn: () => api<AppointmentBill>(`${billPath}/billing/emi`, { method: "DELETE" }),
    onSuccess,
  });
  return { save, clear };
}

export type ReceivePaymentRequest = {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  charge?: number;
};

export function useBill(billPath: BillPath) {
  return useQuery({
    queryKey: ["billing", billPath],
    queryFn: () => api<AppointmentBill>(`${billPath}/billing`),
    retry: 1,
  });
}

export function useReceivePayment(billPath: BillPath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReceivePaymentRequest) =>
      api<AppointmentBill>(`${billPath}/payments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (bill) => {
      queryClient.setQueryData(["billing", billPath], bill);
      // Package sessions share one bill, and the Billing page lists every bill.
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

/** One row of Billing → Pending / Upcoming. */
export type DueItem = {
  invoiceId: string;
  patientId?: string;
  patientName: string;
  description: string;
  dueDate: string;
  amount: number;
  overdueDays: number;
  kind: "bill" | "emi";
  emiNumber?: number;
  emiCount?: number;
};

export type BillingOverview = {
  metrics: {
    receivedToday: number;
    receivedThisMonth: number;
    pendingTotal: number;
    pendingCount: number;
    overdueTotal: number;
    overdueCount: number;
    upcoming30Total: number;
    upcomingCount: number;
  };
  received: (Payment & {
    invoiceId: string;
    patientId?: string;
    patientName: string;
    description: string;
  })[];
  pending: DueItem[];
  upcoming: DueItem[];
};

/** Billing page data; refreshes when payments or invoices change anywhere. */
export function useBillingOverview() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => api<BillingOverview>("/billing/overview"),
    retry: 1,
  });
  const live = getToken() !== null;
  useEffect(() => {
    if (!live) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["billing"] });
    const socket = getSocket();
    const events = ["payment.created", "invoice.created", "invoice.updated"];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [queryClient, live]);
  return query;
}
