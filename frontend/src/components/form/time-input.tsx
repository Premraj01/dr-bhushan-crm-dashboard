import { useState, type InputHTMLAttributes } from "react";
import { Clock3 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTime12 } from "@/lib/validation";
import { cn } from "@/lib/utils";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  /** HH:mm (24-hour), or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable time, HH:mm. */
  min?: string | undefined;
  /** Latest selectable time, HH:mm. */
  max?: string | undefined;
  /** Minutes between choices; 5 by default. */
  stepMinutes?: number;
};

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const pad = (n: number) => String(n).padStart(2, "0");
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/**
 * Time field shown as "09:30 AM", picked from an hour / minute / AM–PM panel in the
 * app's theme. Value in and out is HH:mm, like a native time input.
 */
export function TimeInput({
  value,
  onChange,
  min,
  max,
  stepMinutes = 5,
  className,
  disabled,
  placeholder,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftPm, setDraftPm] = useState<boolean | null>(null);
  const minutes = Array.from({ length: Math.ceil(60 / stepMinutes) }, (_, i) => i * stepMinutes);
  const lo = min ? toMinutes(min) : 0;
  const hi = max ? toMinutes(max) : 24 * 60 - 1;
  const allowed = (h24: number, m: number) => h24 * 60 + m >= lo && h24 * 60 + m <= hi;

  const current = /^\d{2}:\d{2}/.test(value) ? toMinutes(value) : null;
  const h24 = current != null ? Math.floor(current / 60) : null;
  const minute = current != null ? current % 60 : null;
  // With nothing picked yet, lean towards the first allowed time's half of the day.
  const pm = h24 != null ? h24 >= 12 : (draftPm ?? lo >= 12 * 60);

  const to24 = (h12: number, isPm: boolean) => (h12 % 12) + (isPm ? 12 : 0);
  const firstMinute = (hour24: number) => minutes.find((m) => allowed(hour24, m));
  const set = (hour24: number, m: number) => onChange(`${pad(hour24)}:${pad(m)}`);

  const pickHour = (h12: number) => {
    const hour24 = to24(h12, pm);
    const m = minute != null && allowed(hour24, minute) ? minute : firstMinute(hour24);
    if (m != null) set(hour24, m);
  };
  const pickMinute = (m: number) => {
    const hour24 = h24 ?? HOURS.map((h) => to24(h, pm)).find((h) => allowed(h, m));
    if (hour24 == null) return;
    set(hour24, m);
    setOpen(false);
  };
  const pickPeriod = (isPm: boolean) => {
    if (h24 == null) return setDraftPm(isPm);
    const hour24 = to24(h24 % 12, isPm);
    const m = minute != null && allowed(hour24, minute) ? minute : firstMinute(hour24);
    if (m != null) set(hour24, m);
  };
  const periodHasTimes = (isPm: boolean) => HOURS.some((h) => firstMinute(to24(h, isPm)) != null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className={cn("time-field", className)}>
          <PopoverTrigger asChild>
            <input
              {...props}
              type="text"
              readOnly
              data-validate="time"
              disabled={disabled}
              placeholder={placeholder ?? "Select time"}
              value={formatTime12(value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpen(true);
                }
                if ((e.key === "Backspace" || e.key === "Delete") && value) onChange("");
                props.onKeyDown?.(e);
              }}
            />
          </PopoverTrigger>
          <Clock3 className="field-icon" aria-hidden="true" />
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="field-popover time-picker p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="time-picker-head">
          <span>Selected</span>
          <strong>{formatTime12(value) || "--:-- --"}</strong>
        </div>
        <div className="time-picker-body">
          <div className="time-picker-group">
            <span>Hour</span>
            <div className="time-grid hours" role="listbox" aria-label="Hour">
              {HOURS.map((h) => {
                const hour24 = to24(h, pm);
                return (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={h24 === hour24}
                    className={cn(h24 === hour24 && "is-selected")}
                    disabled={firstMinute(hour24) == null}
                    onClick={() => pickHour(h)}
                  >
                    {pad(h)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="time-picker-group">
            <span>Minute</span>
            <div className="time-grid minutes" role="listbox" aria-label="Minute">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={minute === m}
                  className={cn(minute === m && "is-selected")}
                  disabled={h24 != null ? !allowed(h24, m) : false}
                  onClick={() => pickMinute(m)}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="time-picker-group">
            <span>&nbsp;</span>
            <div className="time-period" role="radiogroup" aria-label="AM or PM">
              {[false, true].map((isPm) => (
                <button
                  key={String(isPm)}
                  type="button"
                  role="radio"
                  aria-checked={pm === isPm}
                  className={cn(pm === isPm && "is-selected")}
                  disabled={!periodHasTimes(isPm)}
                  onClick={() => pickPeriod(isPm)}
                >
                  {isPm ? "PM" : "AM"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="picker-footer">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </button>
          <button type="button" className="is-primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
