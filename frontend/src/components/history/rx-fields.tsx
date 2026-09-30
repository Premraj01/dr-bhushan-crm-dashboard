import { DURATIONS, durationLabel, FREQUENCIES, type RxDraft } from "./prescription-options";
import { SelectInput } from "@/components/form/select-input";

/** Dose, frequency, duration and instructions for one prescribed medicine. */
export function RxFields({
  value,
  onChange,
  idPrefix,
}: {
  value: RxDraft;
  onChange: (patch: Partial<RxDraft>) => void;
  idPrefix: string;
}) {
  const custom = value.duration !== "" && !DURATIONS.includes(Number(value.duration));
  return (
    <div className="rx-fields">
      <label>
        Dose
        <input
          maxLength={60}
          value={value.dose}
          onChange={(e) => onChange({ dose: e.target.value })}
          placeholder="e.g. 1 tablet, 1 ml"
        />
      </label>
      <label>
        Frequency
        <input
          maxLength={60}
          list={`${idPrefix}-frequencies`}
          value={value.frequency}
          onChange={(e) => onChange({ frequency: e.target.value })}
          placeholder="e.g. Once daily (OD)"
        />
        <datalist id={`${idPrefix}-frequencies`}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <label>
        Duration
        <SelectInput
          value={value.duration}
          onChange={(e) => onChange({ duration: e.target.value })}
        >
          <option value="">Ongoing</option>
          {DURATIONS.map((d) => (
            <option key={d} value={String(d)}>
              {durationLabel(d)}
            </option>
          ))}
          {custom && (
            <option value={value.duration}>{durationLabel(Number(value.duration))}</option>
          )}
        </SelectInput>
      </label>
      <label className="rx-instructions">
        Instructions
        <input
          maxLength={300}
          value={value.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder="e.g. After food; apply on dry scalp"
        />
      </label>
    </div>
  );
}
