import { useMemo, useState } from "react";
import { CalendarClock, Save } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  formatHours,
  saveClinicTimings,
  useClinicTimings,
  type DayTiming,
} from "@/lib/clinic-timings";

export function ClinicTimingsSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const saved = useClinicTimings();
  const [timings, setTimings] = useState<DayTiming[]>(saved);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const openDays = useMemo(() => timings.filter((item) => item.open), [timings]);
  const invalidDays = timings.filter(
    (item) => item.open && (!item.opensAt || !item.closesAt || item.closesAt <= item.opensAt),
  );

  const updateDay = (index: number, update: Partial<DayTiming>) => {
    setMessage(null);
    setTimings((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)),
    );
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

        <div className="clinic-timings-footer">
          <p>The appointment calendar and booking form only allow times within these hours.</p>
          <Button onClick={save}>
            <Save />
            Save timings
          </Button>
        </div>
      </div>
    </section>
  );
}
