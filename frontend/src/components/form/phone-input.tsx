import type { InputHTMLAttributes } from "react";
import { PHONE_PREFIX, formatPhone, phoneDigits } from "@/lib/validation";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** Any stored format ("+91 98230 78142", "9823078142"); "" when empty. */
  value: string;
  /** "+91 98230 78142" once complete, "+91 98230" while typing, "" when cleared. */
  onChange: (value: string) => void;
};

/**
 * Indian mobile number: a fixed +91 prefix and exactly 10 digits. Pasting a number
 * with +91, 0, spaces or dashes keeps just the 10 digits.
 */
export function PhoneInput({ value, onChange, className, placeholder, ...props }: Props) {
  const digits = phoneDigits(value);
  return (
    <span className={cn("phone-field", className)}>
      <span className="phone-prefix" aria-hidden="true">
        {PHONE_PREFIX}
      </span>
      <input
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete={props.autoComplete ?? "tel-national"}
        data-validate="phone"
        value={digits}
        placeholder={placeholder ?? "98765 43210"}
        // No maxLength: typing a habitual "+91" first overflows to 12 digits, which
        // phoneDigits recognises and trims back to the 10 that matter.
        onChange={(e) => onChange(formatPhone(phoneDigits(e.target.value)))}
        onPaste={(e) => {
          // Let "+91 98230-78142" land as its 10 digits rather than be cut at maxLength.
          const pasted = e.clipboardData.getData("text");
          if (/\D/.test(pasted)) {
            e.preventDefault();
            onChange(formatPhone(phoneDigits(pasted)));
          }
        }}
      />
    </span>
  );
}
