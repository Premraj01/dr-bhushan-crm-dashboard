/** Read at call time so values from .env (loaded by ConfigModule) are honoured. */
export function clinicTimeZone(): string {
  return process.env.CLINIC_TIMEZONE ?? 'Asia/Kolkata';
}

/** Calendar date (YYYY-MM-DD) of an instant, as seen in the clinic's time zone. */
export function clinicDate(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function clinicMonth(value: string | Date = new Date()): string {
  return clinicDate(value).slice(0, 7);
}

/**
 * Adds calendar months to a YYYY-MM-DD date, clamping to the month's last day
 * (31 Jan + 1 month → 28/29 Feb).
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/** Clinic wall-clock date + time ("2026-09-30", "10:00") → ISO instant. */
export function clinicDateTimeToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - zoneOffsetMs(guess, clinicTimeZone())).toISOString();
}

/** YYYY-MM-DD plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Clinic wall-clock time ("09:30") of an instant. */
export function clinicTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: clinicTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
