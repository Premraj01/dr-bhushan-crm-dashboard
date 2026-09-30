/**
 * Field rules shared by every form. Forms use `noValidate`, so the browser's own
 * bubbles never show — `fieldError` turns a field's attributes (required, min, max,
 * pattern, type, data-validate) into the message shown under it.
 */

export const PHONE_PREFIX = "+91";

/** The 10-digit Indian mobile number inside any typed or pasted format. */
export function phoneDigits(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  // An explicit prefix is dropped whole, so a partial "+91 98" stays "98".
  if (raw.startsWith(PHONE_PREFIX))
    return raw.slice(PHONE_PREFIX.length).replace(/\D/g, "").slice(0, 10);
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  else if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Stored format, matching the existing records: "+91 98230 78142". */
export function formatPhone(digits: string): string {
  if (!digits) return "";
  return digits.length === 10
    ? `${PHONE_PREFIX} ${digits.slice(0, 5)} ${digits.slice(5)}`
    : `${PHONE_PREFIX} ${digits}`;
}

/** Indian mobile numbers are 10 digits and start with 6–9. */
export const isValidMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

export function phoneError(digits: string): string | null {
  if (digits.length !== 10) return "Enter a 10-digit mobile number";
  if (!isValidMobile(digits)) return "Mobile numbers start with 6, 7, 8 or 9";
  return null;
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const isValidEmail = (email: string) => EMAIL.test(email.trim());

/* ---------- dates: shown as DD/MM/YYYY, stored as YYYY-MM-DD ---------- */

export const DATE_FORMAT_HINT = "DD/MM/YYYY";

/** "2026-09-30" → "30/09/2026". */
export function isoToDisplay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "30/09/2026" → "2026-09-30"; "" when incomplete or not a real date. */
export function displayToIso(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return "";
  const [, dd, mm, yyyy] = m as unknown as [string, string, string, string];
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const real =
    d.getFullYear() === Number(yyyy) &&
    d.getMonth() === Number(mm) - 1 &&
    d.getDate() === Number(dd);
  return real && Number(yyyy) >= 1900 ? `${yyyy}-${mm}-${dd}` : "";
}

/** Digits typed into a date box, with the slashes put back: "3009" → "30/09". */
export function maskDate(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function isoToDate(iso: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

export function dateToIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- times: stored as HH:mm (24h), shown as 09:30 AM ---------- */

export function formatTime12(hhmm: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, "0")}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/* ---------- messages ---------- */

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The visible label text for a field, used in its messages ("First name is required"). */
export function fieldLabel(el: Field): string {
  const own = el.getAttribute("data-label") ?? el.getAttribute("aria-label");
  if (own) return own;
  const label = el.closest("label");
  if (label) {
    for (const node of Array.from(label.childNodes)) {
      const text =
        node.nodeType === Node.TEXT_NODE
          ? node.textContent
          : node instanceof HTMLElement && /^(SPAN|STRONG|B)$/.test(node.tagName)
            ? node.textContent
            : null;
      const clean = text
        ?.replace(/\s+/g, " ")
        .replace(/[:*]\s*$/, "")
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim();
      if (clean) return clean;
    }
  }
  return "This field";
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/**
 * Why a field is invalid, or null. Any rule's message can be replaced with a
 * `data-error-<rule>` attribute, e.g. `data-error-pattern="Letters and digits only"`.
 */
export function fieldError(el: Field): string | null {
  if (el.disabled || el.closest("fieldset:disabled")) return null;
  if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "submit")) return null;

  const custom = (rule: string) => el.getAttribute(`data-error-${rule}`);
  const label = fieldLabel(el);
  const kind = el.getAttribute("data-validate");
  const value = el.value.trim();
  const required = el.required || el.hasAttribute("data-required");

  if (el instanceof HTMLInputElement && el.type === "file") {
    return required && !el.files?.length ? (custom("required") ?? "Please choose a file") : null;
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return required && !el.checked
      ? (custom("required") ?? "Please tick this box to continue")
      : null;
  }
  if (el instanceof HTMLInputElement && el.type === "number" && el.validity.badInput) {
    return custom("number") ?? "Enter a valid number";
  }

  if (!value) {
    if (!required) return null;
    if (custom("required")) return custom("required");
    if (el instanceof HTMLSelectElement) return `Please select ${lower(label)}`;
    if (kind === "phone") return "Mobile number is required";
    if (kind === "date" || kind === "time" || kind === "select")
      return `Please select ${lower(label)}`;
    return `${label} is required`;
  }

  if (kind === "phone") return custom("phone") ?? phoneError(phoneDigits(value));

  if (el.getAttribute("type") === "email" || kind === "email") {
    return isValidEmail(value)
      ? null
      : (custom("email") ?? "Enter a valid email address, e.g. name@example.com");
  }

  if (kind === "date") {
    const iso = displayToIso(value);
    if (!iso) return custom("date") ?? `Enter a valid date as ${DATE_FORMAT_HINT}`;
    const min = el.getAttribute("data-min");
    const max = el.getAttribute("data-max");
    if (min && iso < min) return custom("min") ?? `Date can’t be before ${isoToDisplay(min)}`;
    if (max && iso > max) return custom("max") ?? `Date can’t be after ${isoToDisplay(max)}`;
    return null;
  }

  if (el instanceof HTMLInputElement && el.type === "number") {
    const n = Number(value);
    const min = el.min !== "" ? Number(el.min) : null;
    const max = el.max !== "" ? Number(el.max) : null;
    if (min != null && n < min) return custom("min") ?? `${label} must be at least ${min}`;
    if (max != null && n > max) return custom("max") ?? `${label} must be ${max} or less`;
    const step = el.step === "any" ? null : Number(el.step || 1);
    if (step && Math.abs((n - (min ?? 0)) / step - Math.round((n - (min ?? 0)) / step)) > 1e-9) {
      return custom("step") ?? (step === 1 ? "Enter a whole number" : `Use steps of ${step}`);
    }
    return null;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const minLength = el.minLength;
    if (minLength > 0 && value.length < minLength) {
      return custom("minlength") ?? `${label} must be at least ${minLength} characters`;
    }
  }

  if (el instanceof HTMLInputElement && el.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(`^(?:${el.pattern})$`, "v");
    } catch {
      re = new RegExp(`^(?:${el.pattern})$`, "u");
    }
    if (!re.test(value)) return custom("pattern") ?? `Enter a valid ${lower(label)}`;
  }

  return null;
}
