import { useMemo, useState } from "react";
import { CalendarClock, CalendarX2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  formatHours,
  saveClinicClosures,
  saveClinicTimings,
  useClinicClosures,
  useClinicTimings,
  type ClinicClosure,
  type DayTiming,
} from "@/lib/clinic-timings";
import {
  findAffectedAppointments,
  type AffectedAppointment,
  type ClinicChange,
} from "./affected-appointments";
import { AffectedAppointmentsDialog } from "./affected-appointments-dialog";

/** "2026-10-02" → "2 Oct 2026". */
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function closureLabel(closure: ClinicClosure) {
  return closure.from === closure.to
    ? formatDate(closure.from)
    : `${formatDate(closure.from)} – ${formatDate(closure.to)}`;
}

export function ClinicTimingsSettings({
  onNotice,
  onReschedule,
}: {
  onNotice: (message: string) => void;
  /** Open the appointment calendar to move visits the new hours rule out. */
  onReschedule: () => void;
}) {
  const saved = useClinicTimings();
  const savedClosures = useClinicClosures();
  const [timings, setTimings] = useState<DayTiming[]>(saved);
  const [closures, setClosures] = useState<ClinicClosure[]>(savedClosures);
  const [draft, setDraft] = useState({ from: "", to: "", reason: "" });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [affected, setAffected] = useState<AffectedAppointment[]>([]);

  // After a change, warn about upcoming appointments that no longer fit. If the server
  // can't be reached the change still stands; the calendar shows the conflicts anyway.
  const checkAffected = async (change: ClinicChange) => {
    setChecking(true);
    try {
      setAffected(await findAffectedAppointments(change));
    } catch {
      setAffected([]);
    } finally {
      setChecking(false);
    }
  };

  const openDays = useMemo(() => timings.filter((item) => item.open), [timings]);
  const invalidDays = timings.filter(
    (item) => item.open && (!item.opensAt || !item.closesAt || item.closesAt <= item.opensAt),
  );
  const sortedClosures = useMemo(
    () => [...closures].sort((a, b) => a.from.localeCompare(b.from)),
    [closures],
  );

  const updateDay = (index: number, update: Partial<DayTiming>) => {
    setMessage(null);
    setTimings((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)),
    );
  };

  const addClosure = () => {
    if (!draft.from) {
      setMessage({ tone: "error", text: "Pick the first closed day before adding a closure." });
      return;
    }
    const to = draft.to || draft.from;
    if (to < draft.from) {
      setMessage({ tone: "error", text: "The last closed day can't be before the first one." });
      return;
    }
    const closure = {
      id: `closure-${Date.now()}`,
      from: draft.from,
      to,
      reason: draft.reason.trim() || "Clinic closed",
    };
    // Closures take effect straight away; the weekly hours still wait for "Save timings".
    const next = [...closures, closure];
    setClosures(next);
    saveClinicClosures(next);
    setDraft({ from: "", to: "", reason: "" });
    setMessage({ tone: "success", text: `Clinic closed on ${closureLabel(closure)}.` });
    void checkAffected({ closure });
  };

  const removeClosure = (id: string) => {
    const next = closures.filter((item) => item.id !== id);
    setClosures(next);
    saveClinicClosures(next);
    setMessage(null);
  };

  const save = () => {
    if (invalidDays.length) {
      setMessage({
        tone: "error",
        text: `Closing time must be later than opening time for ${invalidDays.map((item) => item.day).join(", ")}.`,
      });
      return;
    }
    saveClinicTimings(timings);
    setMessage({ tone: "success", text: "Clinic timings saved successfully." });
    onNotice("Clinic timings saved successfully.");
    void checkAffected({ timings });
  };

  return (
    <section className="panel clinic-timings-panel">
      <SectionHeader
        title="Clinic timings"
        subtitle="Set the working hours used when scheduling appointments"
        trailing={<StatusChip tone="info">Asia/Kolkata</StatusChip>}
      />
      <div className="clinic-timings-body">
        {message && (
          <Banner tone={message.tone} onClose={() => setMessage(null)}>
            {message.text}
          </Banner>
        )}

        <div className="clinic-hours-overview">
          <span className="clinic-hours-icon">
            <CalendarClock />
          </span>
          <div>
            <strong>{openDays.length} days open each week</strong>
            <p>
              {openDays.length
                ? openDays.map((item) => item.short).join(", ")
                : "The clinic is currently closed all week"}
            </p>
          </div>
        </div>

        <div className="clinic-timings-actions">
          <div>
            <strong>Weekly schedule</strong>
            <span>Switch a day off or adjust its opening hours.</span>
          </div>
        </div>

        <div className="clinic-days" role="group" aria-label="Weekly clinic timings">
          {timings.map((item, index) => (
            <div className={`clinic-day-row${item.open ? "" : " is-closed"}`} key={item.day}>
              <div className="clinic-day-name">
                <strong>{item.day}</strong>
                <span>{item.open ? "Open" : "Closed"}</span>
              </div>
              <Switch
                checked={item.open}
                onCheckedChange={(open) => updateDay(index, { open })}
                aria-label={`${item.open ? "Close" : "Open"} clinic on ${item.day}`}
              />
              <label>
                <span>Opens</span>
                <input
                  type="time"
                  value={item.opensAt}
                  disabled={!item.open}
                  onChange={(event) => updateDay(index, { opensAt: event.target.value })}
                />
              </label>
              <span className="clinic-time-separator">to</span>
              <label>
                <span>Closes</span>
                <input
                  type="time"
                  value={item.closesAt}
                  disabled={!item.open}
                  onChange={(event) => updateDay(index, { closesAt: event.target.value })}
                />
              </label>
              <span className="clinic-day-summary">
                {item.open ? formatHours(item) : "No appointments"}
              </span>
            </div>
          ))}
        </div>

        <div className="clinic-timings-actions">
          <div>
            <strong>Closures &amp; holidays</strong>
            <span>Close the clinic for a day or a stretch — a holiday, renovation, or leave.</span>
          </div>
        </div>

        <div className="clinic-closures">
          <div className="clinic-closure-form">
            <label>
              <span>From</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              />
            </label>
            <label className="clinic-closure-reason">
              <span>Reason</span>
              <input
                type="text"
                placeholder="e.g. Diwali, doctor on leave"
                value={draft.reason}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
              />
            </label>
            <Button type="button" variant="outline" onClick={addClosure}>
              <Plus />
              Add closure
            </Button>
          </div>

          {sortedClosures.length ? (
            <div className="clinic-closure-list" role="list" aria-label="Upcoming closures">
              {sortedClosures.map((closure) => (
                <div className="clinic-closure-row" role="listitem" key={closure.id}>
                  <span className="clinic-closure-icon">
                    <CalendarX2 />
                  </span>
                  <div className="clinic-closure-info">
                    <strong>{closureLabel(closure)}</strong>
                    <span>{closure.reason}</span>
                  </div>
                  <button
                    type="button"
                    className="clinic-closure-remove"
                    onClick={() => removeClosure(closure.id)}
                    aria-label={`Remove closure ${closureLabel(closure)}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="clinic-closure-empty">
              No closures planned — the clinic follows the weekly schedule above.
            </p>
          )}
        </div>

        <div className="clinic-timings-footer">
          <p>The appointment calendar and booking form only allow times within these hours.</p>
          <Button onClick={save} disabled={checking}>
            {checking ? <LoaderCircle className="animate-spin" /> : <Save />}
            {checking ? "Checking appointments…" : "Save timings"}
          </Button>
        </div>
      </div>
      <AffectedAppointmentsDialog
        affected={affected}
        onOpenChange={(open) => !open && setAffected([])}
        onReschedule={() => {
          setAffected([]);
          onReschedule();
        }}
        onSendReminder={() => {
          // Not wired up yet: reminders need a messaging channel on the backend.
          setAffected([]);
          onNotice("Sending reminders isn’t available yet — reschedule the appointments for now.");
        }}
      />
    </section>
  );
}
