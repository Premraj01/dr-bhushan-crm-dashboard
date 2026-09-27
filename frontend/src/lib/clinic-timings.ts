import { useSyncExternalStore } from "react";

/**
 * Weekly clinic hours, set in Settings → Clinic timings. Stored in this browser only
 * (the backend has no timings yet); the calendar and the booking form read them from here.
 */
export type DayTiming = {
  day: string;
  short: string;
  open: boolean;
  opensAt: string;
  closesAt: string;
};

const STORAGE_KEY = "drb-clinic-timings";
const CHANGED = "drb-clinic-timings-changed";

/** Monday first, matching the settings screen. */
export const DEFAULT_TIMINGS: DayTiming[] = [
  { day: "Monday", short: "Mon", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Tuesday", short: "Tue", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Wednesday", short: "Wed", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Thursday", short: "Thu", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Friday", short: "Fri", open: true, opensAt: "09:00", closesAt: "18:00" },
  { day: "Saturday", short: "Sat", open: true, opensAt: "09:00", closesAt: "14:00" },
  { day: "Sunday", short: "Sun", open: false, opensAt: "09:00", closesAt: "14:00" },
];

let cachedRaw: string | null | undefined;
let cached: DayTiming[] = DEFAULT_TIMINGS;

function read(): DayTiming[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_TIMINGS;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as DayTiming[]) : null;
    cached = Array.isArray(parsed) && parsed.length === 7 ? parsed : DEFAULT_TIMINGS;
  } catch {
    cached = DEFAULT_TIMINGS;
  }
  return cached;
}

export function saveClinicTimings(timings: DayTiming[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timings));
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  // CHANGED covers this tab; "storage" covers other tabs.
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved weekly hours, updating live when they change in Settings. */
export function useClinicTimings(): DayTiming[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_TIMINGS);
}

/**
 * One-off closures on top of the weekly hours: a single day or a date range
 * (holiday, renovation, doctor away). Stored in this browser like the timings.
 */
export type ClinicClosure = {
  id: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
  reason: string;
};

const CLOSURES_KEY = "drb-clinic-closures";
const CLOSURES_CHANGED = "drb-clinic-closures-changed";

let closuresRaw: string | null | undefined;
let closuresCached: ClinicClosure[] = [];

function readClosures(): ClinicClosure[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CLOSURES_KEY);
  } catch {
    return [];
  }
  if (raw === closuresRaw) return closuresCached;
  closuresRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as ClinicClosure[]) : null;
    closuresCached = Array.isArray(parsed)
      ? parsed.filter((item) => item && item.from && item.to)
      : [];
  } catch {
    closuresCached = [];
  }
  return closuresCached;
}

export function saveClinicClosures(closures: ClinicClosure[]) {
  localStorage.setItem(CLOSURES_KEY, JSON.stringify(closures));
  window.dispatchEvent(new Event(CLOSURES_CHANGED));
}

function subscribeClosures(onChange: () => void) {
  window.addEventListener(CLOSURES_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CLOSURES_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved closures, updating live when they change in Settings. */
export function useClinicClosures(): ClinicClosure[] {
  return useSyncExternalStore(subscribeClosures, readClosures, () => []);
}

/** True when a `YYYY-MM-DD` day falls inside a closure. */
export function isClosedOn(closures: ClinicClosure[], date: string): boolean {
  return closures.some((item) => item.from <= date && date <= item.to);
}

/** Hours for a `YYYY-MM-DD` day. */
export function hoursOn(timings: DayTiming[], date: string): DayTiming {
  const sundayFirst = new Date(`${date}T00:00:00Z`).getUTCDay();
  return timings[(sundayFirst + 6) % 7] ?? DEFAULT_TIMINGS[0]!;
}

/** "09:30" → "9:30 AM". */
export function formatTime(value: string) {
  const [hourText = "0", minute = "00"] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

export function formatHours(hours: DayTiming) {
  return hours.open
    ? `${formatTime(hours.opensAt)} – ${formatTime(hours.closesAt)}`
    : "Clinic closed";
}
