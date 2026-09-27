import { addDays, addMonths, clinicToday } from "@/components/patients/patients-api";
import {
  clinicDateOf,
  clinicTimeOf,
  isUpcoming,
  type Appointment,
} from "@/components/appointments/appointments-api";
import { api } from "@/lib/api";
import {
  closureOn,
  formatTime,
  hoursOn,
  type ClinicClosure,
  type DayTiming,
} from "@/lib/clinic-timings";

/** An upcoming appointment that falls on a closed day or outside the clinic's hours. */
export type AffectedAppointment = { appointment: Appointment; date: string; reason: string };

/** How far ahead weekly-hour changes are checked. */
const LOOKAHEAD_MONTHS = 6;

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    months.push(m);
  }
  return months;
}

/** What just changed: new weekly hours, or a newly added closure. */
export type ClinicChange = { timings: DayTiming[] } | { closure: ClinicClosure };

/**
 * Upcoming (Scheduled/Rescheduled) appointments that `change` puts outside clinic hours.
 * Only the change itself is checked — adding a closure flags just the visits inside it,
 * not ones that already clashed with the weekly hours.
 */
export async function findAffectedAppointments(
  change: ClinicChange,
): Promise<AffectedAppointment[]> {
  const today = clinicToday();
  const from = "closure" in change && change.closure.from > today ? change.closure.from : today;
  const to = "closure" in change ? change.closure.to : addMonths(today, LOOKAHEAD_MONTHS);
  if (to < today) return [];
  const lists = await Promise.all(
    monthsBetween(from, to).map((month) => api<Appointment[]>(`/appointments?month=${month}`)),
  );

  const affected: AffectedAppointment[] = [];
  for (const appointment of lists.flat()) {
    if (!isUpcoming(appointment)) continue;
    const first = clinicDateOf(appointment.startsAt);
    // Multi-day surgery is affected if any of its days is.
    for (let i = 0; i < (appointment.days ?? 1); i++) {
      const date = addDays(first, i);
      if (date < today) continue;
      const reason =
        "closure" in change
          ? closureOn([change.closure], date)?.reason
          : outsideHours(change.timings, date, i === 0 ? clinicTimeOf(appointment.startsAt) : null);
      if (reason) {
        affected.push({ appointment, date, reason });
        break;
      }
    }
  }
  return affected.sort((a, b) => a.appointment.startsAt.localeCompare(b.appointment.startsAt));
}

function outsideHours(timings: DayTiming[], date: string, time: string | null): string | null {
  const hours = hoursOn(timings, date);
  if (!hours.open) return `Closed on ${hours.day}s`;
  if (time && (time < hours.opensAt || time >= hours.closesAt)) {
    return `Outside hours (${formatTime(hours.opensAt)} – ${formatTime(hours.closesAt)})`;
  }
  return null;
}
