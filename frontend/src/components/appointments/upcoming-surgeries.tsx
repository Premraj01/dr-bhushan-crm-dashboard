import { CalendarDays, ChevronRight, RefreshCw, Scissors } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { addDays, addMonths, clinicToday, formatDay } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/mock-auth";
import {
  appointmentTone,
  clinicDateOf,
  clinicTimeOf,
  useAppointmentMonths,
  type Appointment,
} from "./appointments-api";

/** How far ahead the dashboard looks for booked surgeries. */
const LOOKAHEAD_MONTHS = 3;

/**
 * Booked hair transplants still to happen (or under way today), soonest first — the
 * dashboard's view of the theatre. Surgeries without a slot are in Pending bookings.
 */
export function UpcomingSurgeries({
  limit,
  onViewAll,
  onOpenPatient,
}: {
  /** Show only the first N; "View all" opens the calendar when there are more. */
  limit?: number;
  onViewAll?: () => void;
  onOpenPatient: (id: string) => void;
}) {
  const today = clinicToday();
  const months = Array.from({ length: LOOKAHEAD_MONTHS }, (_, i) =>
    addMonths(`${today.slice(0, 7)}-01`, i).slice(0, 7),
  );
  const { data, isPending, isError, refetch, isRefetching } = useAppointmentMonths(months);

  // Surgery is the only appointment with `days`; a multi-day one counts until its last day.
  const list = data
    .filter(
      (a) =>
        a.days !== undefined &&
        (a.status === "Scheduled" || a.status === "Rescheduled" || a.status === "Checked in") &&
        addDays(clinicDateOf(a.startsAt), (a.days ?? 1) - 1) >= today,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const shown = limit ? list.slice(0, limit) : list;

  return (
    <section className="panel pending-queue" aria-label="Upcoming surgeries">
      <SectionHeader
        title="Upcoming surgeries"
        subtitle={
          isPending
            ? "Loading…"
            : list.length === 0
              ? `No surgeries booked in the next ${LOOKAHEAD_MONTHS} months`
              : `${list.length} surger${list.length === 1 ? "y" : "ies"} booked in the next ${LOOKAHEAD_MONTHS} months`
        }
        trailing={
          onViewAll && list.length > shown.length ? (
            <Button variant="ghost" onClick={onViewAll}>
              View all {list.length}
              <ChevronRight />
            </Button>
          ) : undefined
        }
      />
      {isPending ? (
        <div className="pending-list">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="table-error">
          <Banner tone="error">Couldn’t load upcoming surgeries.</Banner>
          <Button variant="outline" onClick={() => void refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="pending-empty">
          <CalendarDays />
          No surgeries booked yet. They appear here once scheduled from Pending bookings.
        </p>
      ) : (
        <ol className="pending-list">
          {shown.map((a) => (
            <SurgeryRow key={a.id} appointment={a} onOpenPatient={onOpenPatient} />
          ))}
        </ol>
      )}
    </section>
  );
}

function SurgeryRow({
  appointment: a,
  onOpenPatient,
}: {
  appointment: Appointment;
  onOpenPatient: (id: string) => void;
}) {
  const first = clinicDateOf(a.startsAt);
  const days = a.days ?? 1;
  const when =
    days > 1
      ? `${formatDay(first)} – ${formatDay(addDays(first, days - 1))}`
      : `${formatDay(first)} · ${clinicTimeOf(a.startsAt)}`;
  return (
    <li className="pending-row surgery upcoming-surgery">
      <span className="pending-rank" aria-hidden>
        <Scissors />
      </span>
      <span className="pending-avatar">{initials(a.patientName)}</span>
      <div className="min-w-0">
        <strong>
          {a.patientName}
          {a.packageId && <span className="agenda-pkg">{a.packageId}</span>}
        </strong>
        <small>
          <b>{when}</b> · {a.type} · {a.doctor}
          {days > 1 && ` · ${days} days`}
        </small>
      </div>
      <div className="pending-chips">
        <StatusChip tone={appointmentTone(a.status)}>{a.status}</StatusChip>
      </div>
      {a.patientId ? (
        <Button size="sm" variant="outline" onClick={() => onOpenPatient(a.patientId!)}>
          View patient
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
}
