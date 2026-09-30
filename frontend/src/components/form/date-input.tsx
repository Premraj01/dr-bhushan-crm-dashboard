import { useEffect, useState, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import type { ChangeEvent } from "react";
import type { DropdownProps } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { SelectInput } from "@/components/form/select-input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DATE_FORMAT_HINT,
  dateToIso,
  displayToIso,
  isoToDate,
  isoToDisplay,
  maskDate,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max"
> & {
  /** YYYY-MM-DD, or "" when empty. */
  value: string;
  /** YYYY-MM-DD once a real date is entered, "" while it's incomplete or cleared. */
  onChange: (value: string) => void;
  /** YYYY-MM-DD, inclusive. */
  min?: string | undefined;
  /** YYYY-MM-DD, inclusive. */
  max?: string | undefined;
};

/**
 * Date field shown and typed as DD/MM/YYYY, with a calendar that matches the app's
 * theme. The value going in and out stays YYYY-MM-DD, like a native date input.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  placeholder,
  ...props
}: Props) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);

  // Follow changes made from outside (a reset, a picked date), but not while the
  // text is mid-typing and already stands for the current value.
  useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (iso: string) => {
    if (iso !== value) onChange(iso);
  };

  const selected = isoToDate(value);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);
  const now = new Date();
  const thisYear = now.getFullYear();
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  const fallbackMonth =
    maxDate && today > maxDate ? maxDate : minDate && today < minDate ? minDate : today;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className={cn("date-field", className)}>
          <input
            {...props}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            data-validate="date"
            {...(min && { "data-min": min })}
            {...(max && { "data-max": max })}
            maxLength={10}
            disabled={disabled}
            placeholder={placeholder ?? DATE_FORMAT_HINT}
            value={text}
            onChange={(e) => {
              const next = maskDate(e.target.value);
              setText(next);
              emit(displayToIso(next));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && e.altKey) {
                e.preventDefault();
                setOpen(true);
              }
              props.onKeyDown?.(e);
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              className="field-icon-button"
              disabled={disabled}
              aria-label="Open calendar"
            >
              <CalendarDays />
            </button>
          </PopoverTrigger>
        </span>
      </PopoverAnchor>
      <PopoverContent align="start" className="field-popover p-0">
        <Calendar
          mode="single"
          className="themed-calendar"
          captionLayout="dropdown"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected ?? fallbackMonth}
          startMonth={minDate ?? new Date(1920, 0)}
          endMonth={maxDate ?? new Date(thisYear + 10, 11)}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          components={{ Dropdown: CalendarDropdown }}
          onSelect={(d) => {
            if (!d) return;
            const iso = dateToIso(d);
            setText(isoToDisplay(iso));
            emit(iso);
            setOpen(false);
          }}
          autoFocus
        />
        <div className="picker-footer">
          <button
            type="button"
            onClick={() => {
              setText("");
              emit("");
              setOpen(false);
            }}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={(minDate && today < minDate) || (maxDate && today > maxDate) || false}
            onClick={() => {
              const iso = dateToIso(today);
              setText(isoToDisplay(iso));
              emit(iso);
              setOpen(false);
            }}
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Month and year pickers in the calendar header, using the app's searchable select. */
function CalendarDropdown({
  options = [],
  value,
  onChange,
  className,
  disabled,
  ...props
}: DropdownProps) {
  const isYear = String(className).includes("years");
  return (
    <SelectInput
      aria-label={props["aria-label"]}
      className={cn("calendar-select", isYear ? "year" : "month")}
      popoverClassName="calendar-select-popover"
      searchable={isYear}
      disabled={!!disabled}
      value={String(value ?? "")}
      options={options.map((o) => ({
        value: String(o.value),
        label: o.label,
        disabled: o.disabled,
      }))}
      // DayPicker only reads `target.value` from the change event.
      onChange={(e) => onChange?.(e as unknown as ChangeEvent<HTMLSelectElement>)}
    />
  );
}
