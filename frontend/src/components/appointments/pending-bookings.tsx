import { CalendarPlus, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { clinicToday } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import { clinicDateOf, usePendingBookings, type PendingBooking } from "./appointments-api";

/** Days since `iso` in clinic time: 0 = today. */
function daysWaiting(iso: string): number {
  const ms =
    Date.parse(`${clinicToday()}T00:00:00Z`) - Date.parse(`${clinicDateOf(iso)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

function waitingLabel(days: number): string {
  return days === 0 ? "created today" : days === 1 ? "waiting 1 day" : `waiting ${days} days`;
}

/**
 * Packages whose hair transplant still needs a slot (never booked, or missed) — the front
 * desk's booking to-do list. PRP isn't queued: it's booked as the patient comes in.
 */
export function PendingBookingsQueue({
  limit,
  onSchedule,
  onViewAll,
  className,
}: {
  /** Show only the first N (dashboard); "View all" appears when more are waiting. */
  limit?: number;
  onSchedule: (booking: PendingBooking) => void;
  onViewAll?: () => void;
  className?: string;
}) {
  const { data, isPending, isError, refetch, isRefetching } = usePendingBookings();
  const list = data ?? [];
  const shown = limit ? list.slice(0, limit) : list;

  return (
    <section className={cn("panel pending-queue", className)} aria-label="Pending bookings">
      <SectionHeader
        title="Pending bookings"
        subtitle={
          isPending
            ? "Loading…"
            : list.length === 0
              ? "Every surgery has a slot"
              : `${list.length} package${list.length === 1 ? "" : "s"} waiting for a slot`
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
          <Banner tone="error">Couldn’t load pending bookings.</Banner>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="pending-empty">
          <CheckCircle2 />
          No pending bookings. Transplant packages appear here until the surgery has a slot.
        </p>
      ) : (
        <ol className="pending-list">
          {shown.map((p, i) => {
            const days = daysWaiting(p.createdAt);
            return (
              <li key={p.packageId} className="pending-row surgery">
                <span className="pending-rank" aria-label={`Position ${i + 1}`}>
                  {i + 1}
                </span>
                <span className="pending-avatar">{initials(p.patientName)}</span>
                <div className="min-w-0">
                  <strong>
                    {p.patientName}
                    <span className="agenda-pkg">{p.packageId}</span>
                  </strong>
                  <small>
                    {p.surgery} ·{" "}
                    <span className={cn(days >= 7 && "overdue")}>{waitingLabel(days)}</span> · by{" "}
                    {p.createdBy}
                  </small>
                </div>
                <div className="pending-chips">
                  {p.missed ? (
                    <StatusChip tone="error">Surgery missed</StatusChip>
                  ) : (
                    <StatusChip tone="warning">Surgery not booked</StatusChip>
                  )}
                </div>
                <Button size="sm" onClick={() => onSchedule(p)}>
                  <CalendarPlus />
                  {p.missed ? "Rebook" : "Schedule"}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
