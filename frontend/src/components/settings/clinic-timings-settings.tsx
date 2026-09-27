import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Copy, MapPin, Save } from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type DayTiming = {
  day: string;
  short: string;
  open: boolean;
  opensAt: string;
  closesAt: string;
};

const STORAGE_KEY = "drb-clinic-timings";
const DEFAULT_TIMINGS: DayTiming[] = [
  { day: "Monday", short: "Mon", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Tuesday", short: "Tue", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Wednesday", short: "Wed", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Thursday", short: "Thu", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Friday", short: "Fri", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Saturday", short: "Sat", open: true, opensAt: "09:00", closesAt: "14:00" },
  { day: "Sunday", short: "Sun", open: false, opensAt: "09:00", closesAt: "14:00" },
];

function formatTime(value: string) {
  const [hourText = "0", minute = "00"] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

export function ClinicTimingsSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const [timings, setTimings] = useState(DEFAULT_TIMINGS);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTimings(JSON.parse(stored) as DayTiming[]);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const openDays = useMemo(() => timings.filter((item) => item.open), [timings]);
  const invalidDays = timings.filter(
    (item) => item.open && (!item.opensAt || !item.closesAt || item.closesAt <= item.opensAt),
  );

  const updateDay = (index: number, update: Partial<DayTiming>) => {
    setMessage(null);
    setTimings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  };

  const copyMonday = () => {
    const monday = timings[0];
    if (!monday) return;
    setMessage(null);
    setTimings((current) => current.map((item, index) => index > 0 && index < 5
      ? { ...item, open: monday.open, opensAt: monday.opensAt, closesAt: monday.closesAt }
      : item));
  };

  const save = () => {
    if (invalidDays.length) {
      setMessage({ tone: "error", text: `Closing time must be later than opening time for ${invalidDays.map((item) => item.day).join(", ")}.` });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timings));
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
        {message && <Banner tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Banner>}

        <div className="clinic-hours-overview">
          <span className="clinic-hours-icon"><CalendarClock /></span>
          <div>
            <strong>{openDays.length} days open each week</strong>
            <p>{openDays.length ? openDays.map((item) => item.short).join(", ") : "The clinic is currently closed all week"}</p>
          </div>
          <div className="clinic-timezone"><MapPin /><span>Pune clinic time</span></div>
        </div>

        <div className="clinic-timings-actions">
          <div>
            <strong>Weekly schedule</strong>
            <span>Switch a day off or adjust its opening hours.</span>
          </div>
          <Button variant="outline" size="sm" onClick={copyMonday}><Copy />Copy Monday to weekdays</Button>
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
                <input type="time" value={item.opensAt} disabled={!item.open} onChange={(event) => updateDay(index, { opensAt: event.target.value })} />
              </label>
              <span className="clinic-time-separator">to</span>
              <label>
                <span>Closes</span>
                <input type="time" value={item.closesAt} disabled={!item.open} onChange={(event) => updateDay(index, { closesAt: event.target.value })} />
              </label>
              <span className="clinic-day-summary">{item.open ? `${formatTime(item.opensAt)} – ${formatTime(item.closesAt)}` : "No appointments"}</span>
            </div>
          ))}
        </div>

        <div className="clinic-timings-footer">
          <p>These hours guide available appointment times across the clinic.</p>
          <Button onClick={save}><Save />Save timings</Button>
        </div>
      </div>
    </section>
  );
}