import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Banner, PageHeader, SectionHeader, StatusChip } from "@/components/crm-ui";
import { addMonths, clinicToday } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  appointmentTone,
  clinicDateOf,
  clinicTimeOf,
  useAppointments,
  type Appointment,
} from "./appointments-api";
import { AppointmentDialog } from "./book-appointment-dialog";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthTitle(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function dayTitle(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export function AppointmentsView({
  onOpenPatient,
  onNotice,
}: {
  onOpenPatient: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const today = clinicToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  // null = closed, "new" = booking, otherwise the appointment being edited.
  const [dialog, setDialog] = useState<"new" | Appointment | null>(null);
  const { data, isPending, isError, refetch, isRefetching } = useAppointments({ month });

  const byDay = new Map<string, Appointment[]>();
  for (const a of data ?? []) {
    const day = clinicDateOf(a.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }
  const [y, m] = month.split("-").map(Number) as [number, number];
  const leading = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from(
    { length: daysInMonth },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );

  const goTo = (next: string) => {
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };
  const agenda = byDay.get(selected) ?? [];

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Clinic schedule, including sessions booked from treatment packages"
        action="Book appointment"
        onAction={() => setDialog("new")}
      />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <SectionHeader
            title={monthTitle(month)}
            trailing={
              <div className="button-pair">
                {month !== today.slice(0, 7) && (
                  <Button variant="ghost" onClick={() => goTo(today.slice(0, 7))}>
                    Today
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => goTo(addMonths(`${month}-01`, -1).slice(0, 7))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => goTo(addMonths(`${month}-01`, 1).slice(0, 7))}
                >
                  <ChevronRight />
                </Button>
              </div>
            }
          />
          <div className="calendar-head" aria-hidden>
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {Array.from({ length: leading }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((day) => {
              const count = (byDay.get(day) ?? []).length;
              return (
                <button
                  key={day}
                  className={cn(
                    day === selected && "selected",
                    count > 0 && "has-event",
                    day === today && "today",
                  )}
                  aria-pressed={day === selected}
                  aria-label={`${new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${count ? `, ${count} appointment${count > 1 ? "s" : ""}` : ""}`}
                  onClick={() => setSelected(day)}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="calendar-key">
            <span>
              <i className="key-dot" />
              Appointments scheduled
            </span>
            <span>
              <i className="key-selected" />
              Selected date
            </span>
            <span>
              <i className="key-today" />
              Today
            </span>
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            title={selected === today ? `Today · ${dayTitle(selected)}` : dayTitle(selected)}
            subtitle={
              isPending
                ? "Loading…"
                : `${agenda.length} appointment${agenda.length === 1 ? "" : "s"}`
            }
          />
          {isPending ? (
            <div className="agenda">
              {Array.from({ length: 3 }, (_, i) => (
                <div className="agenda-row" key={i}>
                  <Skeleton className="h-3 w-10" />
                  <div>
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="table-error">
              <Banner tone="error">
                Couldn’t load appointments. Make sure the backend is running and you signed in with
                it.
              </Banner>
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
                Try again
              </Button>
            </div>
          ) : agenda.length === 0 ? (
            <div className="empty-state">
              <CalendarDays />
              <h3>No appointments</h3>
              <p>Nothing is booked for this day.</p>
            </div>
          ) : (
            <div className="agenda">
              {agenda.map((a) => (
                <button
                  key={a.id}
                  className={cn("agenda-row", a.status === "No show" && "no-show")}
                  onClick={() => setDialog(a)}
                  aria-label={`Edit ${a.patientName}’s appointment at ${clinicTimeOf(a.startsAt)}`}
                >
                  <time>{clinicTimeOf(a.startsAt)}</time>
                  <div className="min-w-0">
                    <strong>
                      {a.patientName}
                      {a.packageId && <span className="agenda-pkg">{a.packageId}</span>}
                    </strong>
                    <span>
                      {a.type} · {a.doctor}
                      {a.durationMinutes >= 480 ? " · full day" : ` · ${a.durationMinutes} min`}
                    </span>
                  </div>
                  <StatusChip tone={appointmentTone(a.status)}>{a.status}</StatusChip>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <AppointmentDialog
        open={dialog !== null}
        appointment={dialog === "new" ? null : dialog}
        defaultDate={selected}
        onOpenChange={(open) => !open && setDialog(null)}
        onOpenPatient={(id) => {
          setDialog(null);
          onOpenPatient(id);
        }}
        onSaved={({ appointment: a, isNewPatient, edited }) => {
          setDialog(null);
          // Jump to the (possibly new) day so the change is visible straight away.
          const day = clinicDateOf(a.startsAt);
          setMonth(day.slice(0, 7));
          setSelected(day);
          const when = `${dayTitle(day)} at ${clinicTimeOf(a.startsAt)}`;
          onNotice(
            edited
              ? `Updated ${a.patientName}${isNewPatient ? " (new patient)" : ""} · ${a.type} · ${when} · ${a.status}.`
              : `Booked ${a.patientName}${isNewPatient ? " (new patient)" : ""} · ${a.type} on ${when}.`,
          );
        }}
      />
    </>
  );
}
