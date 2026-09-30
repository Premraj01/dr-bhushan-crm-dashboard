import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ChevronDown, ChevronUp, Plus, Repeat, X } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { formatDay } from "@/components/patients/patients-api";
import { inr, SurgicalTag, type TreatmentOption } from "@/components/settings/catalog-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatGap,
  isBlock,
  type Gap,
  type GapUnit,
  type PlanBlock,
  type PlanItem,
  type PlanStep,
  type Quote,
} from "./plans-api";
import { SelectInput } from "@/components/form/select-input";

const GAP_UNITS: GapUnit[] = ["days", "weeks", "months"];
const QUICK_GAPS: Gap[] = [
  { value: 7, unit: "days" },
  { value: 14, unit: "days" },
  { value: 21, unit: "days" },
  { value: 1, unit: "months" },
  { value: 3, unit: "months" },
];

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function newStep(treatments: TreatmentOption[]): PlanStep {
  const prp = treatments.find((t) => t.category === "PRP") ?? treatments[0];
  return { treatmentId: prp?.id ?? "", gap: { value: 7, unit: "days" } };
}

/**
 * Builds a plan: steps in order with the gap before each one, and repeat blocks
 * (e.g. PRP → roller → roller, × 4). With `pricing`, each step's price can be
 * changed, set to ₹0 or marked free for this patient.
 */
export function PlanItemsEditor({
  items,
  onChange,
  treatments,
  pricing = false,
}: {
  items: PlanItem[];
  onChange: (items: PlanItem[]) => void;
  treatments: TreatmentOption[];
  pricing?: boolean;
}) {
  const setItem = (i: number, item: PlanItem) =>
    onChange(items.map((x, j) => (j === i ? item : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="plan-editor">
      {items.length === 0 && (
        <p className="package-empty">No steps yet. Add a treatment or a repeat block.</p>
      )}
      <ol className="plan-items">
        {items.map((item, i) => {
          const actions = (
            <ItemActions
              label={isBlock(item) ? "repeat block" : "step"}
              onUp={i > 0 ? () => onChange(move(items, i, i - 1)) : undefined}
              onDown={i < items.length - 1 ? () => onChange(move(items, i, i + 1)) : undefined}
              onRemove={() => remove(i)}
            />
          );
          return isBlock(item) ? (
            <li key={i} className="plan-block">
              <BlockEditor
                block={item}
                firstInPlan={i === 0}
                treatments={treatments}
                pricing={pricing}
                onChange={(b) => (b.steps.length ? setItem(i, b) : remove(i))}
                onMoveLastOut={() => {
                  // [A … A] × n  →  [A …] × n, then A once: A … A … A, never A A.
                  const last = item.steps[item.steps.length - 1]!;
                  const next = [...items];
                  next.splice(i, 1, { ...item, steps: item.steps.slice(0, -1) }, last);
                  onChange(next);
                }}
                actions={actions}
              />
            </li>
          ) : (
            <li key={i} className="plan-item">
              <StepEditor
                step={item}
                gapLabel={i === 0 ? null : "after the previous visit"}
                treatments={treatments}
                pricing={pricing}
                onChange={(s) => setItem(i, s)}
                actions={actions}
              />
            </li>
          );
        })}
      </ol>
      <div className="plan-add">
        <button
          type="button"
          className="link-reset"
          onClick={() => onChange([...items, newStep(treatments)])}
        >
          <Plus />
          Add step
        </button>
        <button
          type="button"
          className="link-reset"
          onClick={() => onChange([...items, { repeat: 2, steps: [newStep(treatments)] }])}
        >
          <Repeat />
          Add repeat block
        </button>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  firstInPlan,
  treatments,
  pricing,
  onChange,
  onMoveLastOut,
  actions,
}: {
  block: PlanBlock;
  firstInPlan: boolean;
  treatments: TreatmentOption[];
  pricing: boolean;
  onChange: (block: PlanBlock) => void;
  /** Moves the block's last step out, after the block. */
  onMoveLastOut: () => void;
  actions: ReactNode;
}) {
  const first = block.steps[0];
  const last = block.steps[block.steps.length - 1];
  // A block that starts and ends with the same treatment puts two of them back to back
  // where one round meets the next (PRP … PRP | PRP … PRP).
  const backToBack =
    block.repeat > 1 &&
    block.steps.length > 1 &&
    first !== undefined &&
    first.treatmentId === last?.treatmentId;
  const backToBackName = treatments.find((t) => t.id === first?.treatmentId)?.name ?? "it";
  const setStep = (j: number, step: PlanStep) =>
    onChange({ ...block, steps: block.steps.map((s, k) => (k === j ? step : s)) });
  return (
    <>
      <div className="plan-block-head">
        <Repeat />
        <label>
          Repeat
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            value={block.repeat}
            onChange={(e) =>
              onChange({ ...block, repeat: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })
            }
            aria-label="Rounds"
          />
          round{block.repeat === 1 ? "" : "s"}
        </label>
        <small>
          {block.steps.length * block.repeat} visit
          {block.steps.length * block.repeat === 1 ? "" : "s"}
        </small>
        {actions}
      </div>
      {backToBack && (
        <div className="plan-block-warning" role="status">
          <p>
            Each round starts and ends with {backToBackName}, so rounds meet with two{" "}
            {backToBackName} visits back to back. To keep the steps in between each {backToBackName}
            , repeat the block without the last {backToBackName} and finish with one{" "}
            {backToBackName}.
          </p>
          <button type="button" className="link-reset" onClick={onMoveLastOut}>
            Fix: move the last {backToBackName} after the block
          </button>
        </div>
      )}
      <ol className="plan-block-steps">
        {block.steps.map((step, j) => (
          <li key={j}>
            <StepEditor
              step={step}
              gapLabel={
                j > 0
                  ? "after the previous visit"
                  : firstInPlan
                    ? "between rounds"
                    : "after the previous visit, and between rounds"
              }
              treatments={treatments}
              pricing={pricing}
              onChange={(s) => setStep(j, s)}
              actions={
                <ItemActions
                  label="step"
                  onUp={
                    j > 0
                      ? () => onChange({ ...block, steps: move(block.steps, j, j - 1) })
                      : undefined
                  }
                  onDown={
                    j < block.steps.length - 1
                      ? () => onChange({ ...block, steps: move(block.steps, j, j + 1) })
                      : undefined
                  }
                  onRemove={() =>
                    onChange({ ...block, steps: block.steps.filter((_, k) => k !== j) })
                  }
                />
              }
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="link-reset plan-block-add"
        onClick={() => onChange({ ...block, steps: [...block.steps, newStep(treatments)] })}
      >
        <Plus />
        Add step to this block
      </button>
    </>
  );
}

function StepEditor({
  step,
  gapLabel,
  treatments,
  pricing,
  onChange,
  actions,
}: {
  step: PlanStep;
  /** null for the first visit of the plan (no gap). */
  gapLabel: string | null;
  treatments: TreatmentOption[];
  pricing: boolean;
  onChange: (step: PlanStep) => void;
  actions: ReactNode;
}) {
  const treatment = treatments.find((t) => t.id === step.treatmentId);
  const gap = step.gap ?? { value: 7, unit: "days" as const };
  const graft = treatment?.pricingUnit === "graft";
  const setGap = (g: Gap) => onChange({ ...step, gap: g });

  return (
    <div className="plan-step">
      {gapLabel && (
        <div className="plan-gap">
          <ArrowDown />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={gap.value}
            onChange={(e) => setGap({ ...gap, value: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Gap"
          />
          <SelectInput
            value={gap.unit}
            onChange={(e) => setGap({ ...gap, unit: e.target.value as GapUnit })}
            aria-label="Gap unit"
          >
            {GAP_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </SelectInput>
          <span>{gapLabel}</span>
          <span className="plan-gap-quick" aria-label="Quick gaps">
            {QUICK_GAPS.map((g) => (
              <button
                key={formatGap(g)}
                type="button"
                className={cn(g.value === gap.value && g.unit === gap.unit && "active")}
                onClick={() => setGap(g)}
              >
                {g.unit === "days" ? `${g.value}d` : `${g.value}m`}
              </button>
            ))}
          </span>
        </div>
      )}
      <div className={cn("plan-step-main", pricing && "pricing")}>
        <SelectInput
          value={step.treatmentId}
          onChange={(e) => {
            const next = treatments.find((t) => t.id === e.target.value);
            // Prices belong to a treatment: switching resets a changed price.
            const { unitPrice: _p, quantity: _q, ...rest } = step;
            onChange({
              ...rest,
              treatmentId: e.target.value,
              ...(next?.pricingUnit === "graft" && { quantity: 2000 }),
            });
          }}
          aria-label="Treatment"
        >
          {!treatment && <option value={step.treatmentId}>Choose a treatment</option>}
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
        {/* Settings only: the package builder doesn't mark surgical treatments. */}
        {!pricing && treatment?.surgical && <SurgicalTag />}
        {pricing && graft && (
          <label className="plan-qty">
            <input
              type="number"
              inputMode="numeric"
              min={100}
              max={10000}
              step={50}
              value={step.quantity ?? ""}
              onChange={(e) => {
                const { quantity: _q, ...rest } = step;
                onChange(e.target.value ? { ...rest, quantity: Number(e.target.value) } : rest);
              }}
              aria-label="Grafts"
            />
            grafts
          </label>
        )}
        {pricing && (
          <label className="plan-price">
            ₹
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={step.complimentary ? 0 : (step.unitPrice ?? "")}
              placeholder={treatment ? String(treatment.price) : ""}
              disabled={step.complimentary}
              onChange={(e) => {
                const { unitPrice: _p, ...rest } = step;
                onChange(
                  e.target.value === "" ? rest : { ...rest, unitPrice: Number(e.target.value) },
                );
              }}
              aria-label={graft ? "Price per graft" : "Price per session"}
            />
            {graft && <small>/graft</small>}
          </label>
        )}
        <button
          type="button"
          className={cn("plan-free", step.complimentary && "active")}
          aria-pressed={!!step.complimentary}
          onClick={() => onChange({ ...step, complimentary: !step.complimentary })}
          title="Complimentary — no charge for this visit"
        >
          Free
        </button>
        {actions}
      </div>
    </div>
  );
}

function ItemActions({
  label,
  onUp,
  onDown,
  onRemove,
}: {
  label: string;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
  onRemove: () => void;
}) {
  return (
    <span className="plan-actions">
      <button type="button" onClick={onUp} disabled={!onUp} aria-label={`Move ${label} up`}>
        <ChevronUp />
      </button>
      <button type="button" onClick={onDown} disabled={!onDown} aria-label={`Move ${label} down`}>
        <ChevronDown />
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X />
      </button>
    </span>
  );
}

/** The plan as dated visits, priced by the server. */
export function PlanPreview({
  quote,
  isPending,
  error,
  showPrices = false,
  markSurgical = true,
  showRounds = true,
}: {
  quote: Quote | undefined;
  isPending: boolean;
  error: unknown;
  showPrices?: boolean;
  /** Show the surgical icon on surgery visits (off in the package builder). */
  markSurgical?: boolean;
  /** Show "round 2 of 4" on repeat-block visits (off in the package builder). */
  showRounds?: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const previous = useRef<string[] | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  // When visits are added, scroll the list to the first new one and highlight it.
  useEffect(() => {
    if (!quote) return;
    const now = quote.steps.map((s) => `${s.treatmentId}|${s.cycle?.n ?? ""}`);
    const before = previous.current;
    previous.current = now;
    if (!before || now.length <= before.length) return;
    let at = now.findIndex((key, i) => key !== before[i]);
    if (at < 0) at = before.length;
    const list = listRef.current;
    const row = list?.children[at] as HTMLElement | undefined;
    if (list && row) {
      // The list is position:relative, so offsetTop is measured from its top.
      list.scrollTo({ top: Math.max(0, row.offsetTop - 8) });
    }
    setAdded(at);
    const t = setTimeout(() => setAdded(null), 1400);
    return () => clearTimeout(t);
  }, [quote]);

  if (error)
    return (
      <Banner tone="error">
        {error instanceof ApiError ? error.message : "Couldn’t preview this plan."}
      </Banner>
    );
  if (!quote) return isPending ? <Skeleton className="h-40 w-full" /> : null;
  const last = quote.steps[quote.steps.length - 1];
  // "PRP session × 3 (1 free)", in the order treatments first appear.
  const counts = new Map<string, { n: number; free: number }>();
  for (const s of quote.steps) {
    const c = counts.get(s.description) ?? { n: 0, free: 0 };
    counts.set(s.description, { n: c.n + 1, free: c.free + (s.complimentary ? 1 : 0) });
  }
  return (
    <div className="plan-preview">
      <p className="plan-preview-head">
        <strong>
          {quote.steps.length} visit{quote.steps.length === 1 ? "" : "s"}
        </strong>
        {last && (
          <span>
            {" "}
            · {formatDay(quote.startDate)} → ~{formatDay(last.dueDate)}
          </span>
        )}
      </p>
      <ul className="plan-counts" aria-label="Visits per treatment">
        {[...counts].map(([name, c]) => (
          <li key={name}>
            <span>{name}</span>
            <b>
              × {c.n}
              {c.free > 0 && <small> ({c.free === c.n ? "free" : `${c.free} free`})</small>}
            </b>
          </li>
        ))}
      </ul>
      <ol ref={listRef}>
        {quote.steps.map((s) => (
          <li
            key={s.index}
            className={cn(s.surgery && "surgery", added === s.index && "just-added")}
          >
            <span className="pp-num">{s.index + 1}</span>
            <span className="pp-date">{formatDay(s.dueDate)}</span>
            <span className="pp-what">
              {s.description}
              {markSurgical && s.surgery && <SurgicalTag />}
              {showRounds && s.cycle && (
                <small>
                  {" "}
                  · round {s.cycle.n} of {s.cycle.of}
                </small>
              )}
            </span>
            <small className="pp-gap">
              {s.gap && s.index > 0 ? `+${formatGap(s.gap)}` : "Start"}
            </small>
            {showPrices && (
              <b className={cn(s.amount === 0 && "free")}>
                {s.complimentary ? "Free" : inr.format(s.amount)}
              </b>
            )}
          </li>
        ))}
      </ol>
      <p className="plan-preview-note">
        Dates are a guide: each visit is due its gap after the previous visit actually happens.
      </p>
    </div>
  );
}
