export function longDate(iso: string): string {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Drops empty optional strings so the API gets only what was filled in. */
export function clean<T extends object>(row: T): T {
  return Object.fromEntries(
    Object.entries(row)
      .map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
      .filter(([, v]) => v !== "" && v !== undefined && !(typeof v === "number" && isNaN(v))),
  ) as T;
}

/** A partial update where `undefined` clears a field (removed by `clean` before saving). */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };
