import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Scissors } from "lucide-react";
import { Banner, PageHeader, SectionHeader, StatusChip } from "@/components/crm-ui";
import {
  addDays,
  addMonths,
  clinicToday,
  formatDay,
  usePackages,
  type TreatmentPackage,
} from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  appointmentTone,
  clinicDateOf,
  clinicTimeOf,
  useAppointments,
  usePendingBookings,
  type Appointment,
} from "./appointments-api";
import { AppointmentDialog, type SessionToBook } from "./book-appointment-dialog";
import { CheckInTick } from "./check-in-tick";
import { PendingBookingsQueue } from "./pending-bookings";

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

/**
 * Open the booking form for a package step (`index`, or the package's next step),
 * optionally on a given day.
 */
export type Scheduling = { patientId: string; packageId: string; index?: number; date?: string };

/** Where to start booking a step: its due date, or today if that has passed. */
function suggestedDate(pkg: TreatmentPackage, index: number): string {
  const due = pkg.steps[index]?.dueDate ?? clinicToday();
  return due < clinicToday() ? clinicToday() : due;
}

type DayEntry = { appointment: Appointment; dayIndex: number };

/** The step to book: the one asked for if it still needs a slot, else the package's next. */
function stepToBook(pkg: TreatmentPackage, index?: number): number {
  const asked = index !== undefined ? pkg.steps[index] : undefined;
  if (asked && (asked.state === "to-book" || asked.state === "missed")) return asked.index;
  return pkg.next ?? -1;
}

export function AppointmentsView({
  scheduling,
  onStartScheduling,
  onEndScheduling,
  onOpenPatient,
  onNotice,
}: {
  /** When set, a panel lists this package's sessions to book into the calendar. */
  scheduling?: Scheduling | null | undefined;
  /** Start scheduling a package from the pending-booking queue. */
  onStartScheduling?: ((s: Scheduling) => void) | undefined;
  onEndScheduling?: (() => void) | undefined;
  onOpenPatient: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const today = clinicToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  // null = closed, "new" = booking, a package session, or the appointment being edited.
  const [dialog, setDialog] = useState<
    "new" | { session: SessionToBook; date?: string | undefined } | Appointment | null
  >(null);
  // Patients whose surgery package still needs a slot — for "Schedule surgery on <day>".
  const { data: pending } = usePendingBookings();
  const awaitingSurgery = pending ?? [];
  const [surgeryPick, setSurgeryPick] = useState("");
  const pickedPackage =
    awaitingSurgery.find((p) => p.packageId === surgeryPick) ?? awaitingSurgery[0];
  const { data, isPending, isError, refetch, isRefetching } = useAppointments({ month });
  const { data: packages } = usePackages(scheduling?.patientId ?? null);
  const pkg = packages?.find((p) => p.id === scheduling?.packageId);

  // "Schedule"/"Book" (queues, package card, "Next: schedule surgery") opens the booking
  // form for that package step. Visits booked the normal way also take their step.
  const [openedFor, setOpenedFor] = useState<Scheduling | null>(null);
  useEffect(() => {
    if (!scheduling || !pkg || openedFor === scheduling) return;
    setOpenedFor(scheduling);
    const index = stepToBook(pkg, scheduling.index);
    if (pkg.status !== "Accepted" || index < 0) {
      onNotice(
        pkg.status !== "Accepted"
          ? `${pkg.id} is ${pkg.status.toLowerCase()}.`
          : `Every visit of ${pkg.id} is already booked.`,
      );
      onEndScheduling?.();
      return;
    }
    setDialog({ session: { pkg, index }, date: scheduling.date });
  }, [scheduling, pkg, openedFor, onNotice, onEndScheduling]);

  // Multi-day surgery appears on every day it covers.
  const byDay = new Map<string, DayEntry[]>();
  for (const a of data ?? []) {
    const first = clinicDateOf(a.startsAt);
    for (let dayIndex = 0; dayIndex < (a.days ?? 1); dayIndex++) {
      const day = addDays(first, dayIndex);
      byDay.set(day, [...(byDay.get(day) ?? []), { appointment: a, dayIndex }]);
    }
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
  // The open appointment, kept in step with the latest data (e.g. after check-in or "Mark completed").
  const editingNow =
    dialog && dialog !== "new" && !("session" in dialog)
      ? ((data ?? []).find((a) => a.id === dialog.id) ?? dialog)
      : null;
  // Days the operating theatre is taken. OPD (consultations, PRP) can still be booked.
  const surgeryOn = (day: string) =>
    (byDay.get(day) ?? []).find(({ appointment: a }) => a.days !== undefined)?.appointment;
  const selectedSurgery = surgeryOn(selected);

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Clinic schedule, including sessions booked from treatment packages"
        action="Book appointment"
        onAction={() => setDialog("new")}
      />
      {onStartScheduling && (
        <PendingBookingsQueue
          onSchedule={(p) =>
            onStartScheduling({
              packageId: p.packageId,
              patientId: p.patientId,
              index: p.stepIndex,
            })
          }
        />
      )}
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
              const surgery = surgeryOn(day);
              return (
                <button
                  key={day}
                  className={cn(
                    day === selected && "selected",
                    count > 0 && "has-event",
                    day === today && "today",
                    surgery && "surgery-day",
                  )}
                  aria-pressed={day === selected}
                  aria-label={`${new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${surgery ? ", surgery day (theatre blocked, OPD open)" : ""}${count ? `, ${count} appointment${count > 1 ? "s" : ""}` : ""}`}
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
            <span>
              <i className="key-surgery" />
              Surgery day · theatre blocked, OPD open
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
          {!isPending && selected >= today && !selectedSurgery && onStartScheduling && (
            <div className="day-surgery-picker">
              <p>
                <strong>Schedule surgery on {dayTitle(selected)}</strong>
                <span>
                  {awaitingSurgery.length
                    ? "Patients whose surgery package isn’t booked yet."
                    : "No patients are waiting for surgery. Create a package with a hair transplant first."}
                </span>
              </p>
              {awaitingSurgery.length > 0 && pickedPackage && (
                <div className="day-surgery-controls">
                  <select
                    aria-label="Patient awaiting surgery"
                    value={pickedPackage.packageId}
                    onChange={(e) => setSurgeryPick(e.target.value)}
                  >
                    {awaitingSurgery.map((p) => (
                      <option key={p.packageId} value={p.packageId}>
                        {p.patientName} · {p.packageId} · {p.surgery}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() =>
                      onStartScheduling({
                        packageId: pickedPackage.packageId,
                        patientId: pickedPackage.patientId,
                        index: pickedPackage.stepIndex,
                        date: selected,
                      })
                    }
                  >
                    <Scissors />
                    Schedule surgery
                  </Button>
                </div>
              )}
            </div>
          )}
          {selectedSurgery && !isPending && (
            <div className="surgery-day-note">
              <Scissors />
              <p>
                <strong>Surgery day — theatre blocked</strong>
                <span>
                  {selectedSurgery.patientName} · {selectedSurgery.type}. Consultations and PRP
                  sessions can still be booked.
                </span>
              </p>
            </div>
          )}
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
              {agenda.map(({ appointment: a, dayIndex }) => (
                <div key={`${a.id}-${dayIndex}`} className="agenda-item">
                  {/* One tick per appointment: on its first day for multi-day surgery. */}
                  {dayIndex === 0 ? (
                    <CheckInTick appointment={a} onNotice={onNotice} />
                  ) : (
                    <span aria-hidden />
                  )}
                  <button
                    className="agenda-row"
                    onClick={() => setDialog(a)}
                    aria-label={`Edit ${a.patientName}’s appointment at ${clinicTimeOf(a.startsAt)}`}
                  >
                    <time>{dayIndex === 0 ? clinicTimeOf(a.startsAt) : `Day ${dayIndex + 1}`}</time>
                    <div className="min-w-0">
                      <strong>
                        {a.patientName}
                        {a.packageId && <span className="agenda-pkg">{a.packageId}</span>}
                      </strong>
                      <span>
                        {a.type} · {a.doctor}
                        {(a.days ?? 1) > 1
                          ? ` · day ${dayIndex + 1} of ${a.days}`
                          : a.durationMinutes >= 480
                            ? " · full day"
                            : ` · ${a.durationMinutes} min`}
                      </span>
                    </div>
                    <StatusChip tone={appointmentTone(a.status)}>{a.status}</StatusChip>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <AppointmentDialog
        open={dialog !== null}
        appointment={editingNow}
        session={dialog && dialog !== "new" && "session" in dialog ? dialog.session : null}
        onSessionBooked={(updated, index) => {
          setDialog(null);
          onEndScheduling?.();
          const step = updated.steps[index];
          // Show the day that was just booked.
          if (step?.date) {
            setMonth(step.date.slice(0, 7));
            setSelected(step.date);
          }
          const after = updated.steps[index + 1];
          onNotice(
            `Booked ${step?.description ?? "the visit"} for ${updated.patientName} on ${step?.date ? dayTitle(step.date) : "the selected day"}.` +
              (after
                ? ` Next in the plan: ${after.description}, due ~${formatDay(after.dueDate)}.`
                : ""),
          );
        }}
        defaultDate={
          dialog && dialog !== "new" && "session" in dialog
            ? (dialog.date ?? suggestedDate(dialog.session.pkg, dialog.session.index))
            : selected
        }
        onOpenChange={(open) => {
          if (open) return;
          if (dialog && dialog !== "new" && "session" in dialog) onEndScheduling?.();
          setDialog(null);
        }}
        onOpenPatient={(id) => {
          setDialog(null);
          onOpenPatient(id);
        }}
        onPaymentReceived={onNotice}
        onBookNext={(next) => {
          setDialog(null);
          onStartScheduling?.(next);
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
