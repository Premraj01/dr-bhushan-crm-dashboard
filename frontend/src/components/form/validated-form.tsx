import { forwardRef, useLayoutEffect, useRef, useState, type FormHTMLAttributes } from "react";
import { fieldError } from "@/lib/validation";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type FormProps = FormHTMLAttributes<HTMLFormElement>;
type SubmitEvent = Parameters<NonNullable<FormProps["onSubmit"]>>[0];

const FIELDS = "input, select, textarea";

/** Where a field's message is shown: its label, or its wrapper when it has none. */
function hostOf(el: Field): HTMLElement | null {
  return el.closest("label") ?? el.parentElement;
}

/** Shows or clears one field's message; returns whether it's valid. */
function paint(el: Field): boolean {
  const message = fieldError(el);
  const host = hostOf(el);
  if (message) {
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("data-invalid", "");
    host?.setAttribute("data-field-error", message);
  } else {
    if (el.hasAttribute("data-invalid")) el.removeAttribute("aria-invalid");
    el.removeAttribute("data-invalid");
    host?.removeAttribute("data-field-error");
  }
  return !message;
}

function fieldsOf(form: HTMLFormElement): Field[] {
  return Array.from(form.querySelectorAll<Field>(FIELDS));
}

/**
 * A `<form>` with the browser's validation bubbles replaced by our own messages,
 * shown under each field. `onSubmit` only runs once every field is valid.
 *
 * Rules come from the usual attributes (required, min, max, pattern, type="email")
 * plus `data-validate="phone" | "date"`; see `fieldError` in lib/validation.
 */
export const ValidatedForm = forwardRef<HTMLFormElement, FormProps>(function ValidatedForm(
  { onSubmit, onBlur, onInput, children, ...props },
  ref,
) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [summary, setSummary] = useState("");

  // Keep shown messages in step with what's typed or picked — including custom
  // pickers, which change values without firing DOM events. After a failed submit,
  // every field is re-checked.
  useLayoutEffect(() => {
    if (!formRef.current) return;
    for (const el of fieldsOf(formRef.current)) {
      if (attempted || el.hasAttribute("data-invalid")) paint(el);
    }
  });

  const submit = (e: SubmitEvent) => {
    const form = e.currentTarget;
    const invalid = fieldsOf(form).filter((el) => !paint(el));
    if (invalid.length > 0) {
      e.preventDefault();
      setAttempted(true);
      const first = invalid[0]!;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: "center", behavior: "smooth" });
      setSummary(
        `${invalid.length === 1 ? "1 field needs" : `${invalid.length} fields need`} attention. ${fieldError(first)}`,
      );
      return;
    }
    setAttempted(false);
    setSummary("");
    onSubmit?.(e);
  };

  return (
    <form
      {...props}
      ref={(node) => {
        formRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      noValidate
      onSubmit={submit}
      // Leaving a filled-in field checks it straight away; empty ones wait for submit.
      onBlur={(e) => {
        const el = e.target as unknown as Field;
        if (el.matches?.(FIELDS) && (attempted || el.value.trim())) paint(el);
        onBlur?.(e);
      }}
      onInput={(e) => {
        const el = e.target as unknown as Field;
        if (el.matches?.(FIELDS) && el.hasAttribute("data-invalid")) paint(el);
        onInput?.(e);
      }}
    >
      {children}
      <span className="sr-only" role="status" aria-live="polite">
        {summary}
      </span>
    </form>
  );
});
