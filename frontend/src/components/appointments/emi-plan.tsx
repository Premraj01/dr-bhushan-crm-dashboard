import { useState } from "react";
import { CalendarClock, ChevronRight, LoaderCircle, Trash2 } from "lucide-react";
import { Banner, StatusChip, type Tone } from "@/components/crm-ui";
import { addDays, addMonths, clinicToday } from "@/components/patients/patients-api";
import { inr } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ApiError } from "@/lib/api";
import {
  useEmiPlan,
  type AppointmentBill,
  type BillPath,
  type Installment,
} from "./appointments-api";

const INSTALLMENT_TONE: Record<Installment["status"], Tone> = {
  Paid: "success",
  "Part paid": "warning",
  Due: "warning",
  Overdue: "error",
  Upcoming: "neutral",
};

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function errorText(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Couldn’t reach the clinic server. Make sure the backend is running.";
}

/** Equal EMIs; any leftover rupees go on the first one. */
function splitEvenly(total: number, count: number, first: string, everyMonths: number) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    dueDate: addMonths(first, i * everyMonths),
    amount: String(base + (i === 0 ? total - base * count : 0)),
  }));
}

/** Plan the balance as EMIs: count, first due date and frequency, then fine-tune each row. */
export function EmiPlanner({
  bill,
  billPath,
  onSaved,
  onCancel,
}: {
  bill: AppointmentBill;
  billPath: BillPath;
  onSaved: (message: string) => void;
  onCancel?: (() => void) | undefined;
}) {
  const { save } = useEmiPlan(billPath);
  const [charge, setCharge] = useState("");
  const balance = bill.needsCharge ? bill.balance + (Number(charge) || 0) : bill.balance;
  const [count, setCount] = useState(3);
  const [first, setFirst] = useState(() => addMonths(clinicToday(), 1));
  const [every, setEvery] = useState(1);
  const [rows, setRows] = useState(() => splitEvenly(balance, 3, addMonths(clinicToday(), 1), 1));
  const regenerate = (next: { count?: number; first?: string; every?: number; total?: number }) => {
    const c = next.count ?? count;
    const f = next.first ?? first;
    const e = next.every ?? every;
    setRows(splitEvenly(next.total ?? balance, c, f, e));
  };

  const sum = rows.reduce((total, r) => total + (Number(r.amount) || 0), 0);
  const ordered = rows.every((r, i) => i === 0 || r.dueDate > rows[i - 1]!.dueDate);
  const valid =
    balance > 0 &&
    sum === balance &&
    ordered &&
    rows.every((r) => Number(r.amount) >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) &&
    rows[0]!.dueDate >= clinicToday();

  const submit = () =>
    save.mutate(
      {
        installments: rows.map((r) => ({ dueDate: r.dueDate, amount: Number(r.amount) })),
        ...(bill.needsCharge && { charge: Number(charge) }),
      },
      {
        onSuccess: () =>
          onSaved(
            `EMI plan saved: ${rows.length} payments of about ${inr.format(Math.round(balance / rows.length))}, first due ${shortDate(rows[0]!.dueDate)}.`,
          ),
      },
    );

  return (
    <section className="emi-planner" aria-label="EMI plan">
      <h4 className="billing-heading">Schedule part payments (EMI)</h4>
      <div className="form-grid">
        {bill.needsCharge && (
          <label className="full">
            Visit charge (₹)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={charge}
              onChange={(e) => {
                setCharge(e.target.value);
                regenerate({ total: Number(e.target.value) || 0 });
              }}
              placeholder="This visit isn’t priced in Settings — enter the charge"
            />
          </label>
        )}
        <label>
          Number of EMIs
          <select
            value={count}
            onChange={(e) => {
              setCount(Number(e.target.value));
              regenerate({ count: Number(e.target.value) });
            }}
          >
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} payments
              </option>
            ))}
          </select>
        </label>
        <label>
          Frequency
          <select
            value={every}
            onChange={(e) => {
              setEvery(Number(e.target.value));
              regenerate({ every: Number(e.target.value) });
            }}
          >
            <option value={1}>Monthly</option>
            <option value={2}>Every 2 months</option>
            <option value={3}>Every 3 months</option>
          </select>
        </label>
        <label className="full">
          First EMI due on
          <input
            type="date"
            min={clinicToday()}
            value={first}
            onChange={(e) => {
              setFirst(e.target.value);
              if (e.target.value) regenerate({ first: e.target.value });
            }}
          />
        </label>
      </div>

      <ol className="emi-rows" aria-label="EMI schedule">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="step-no">{i + 1}</span>
            <input
              type="date"
              aria-label={`EMI ${i + 1} due date`}
              value={r.dueDate}
              min={i === 0 ? clinicToday() : addDays(rows[i - 1]!.dueDate, 1)}
              onChange={(e) =>
                setRows((all) =>
                  all.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)),
                )
              }
            />
            <label className="emi-amount">
              ₹
              <input
                type="number"
                inputMode="numeric"
                min={1}
                aria-label={`EMI ${i + 1} amount`}
                value={r.amount}
                onChange={(e) =>
                  setRows((all) =>
                    all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                  )
                }
              />
            </label>
          </li>
        ))}
      </ol>
      <p className={`emi-total${sum === balance ? " ok" : ""}`}>
        EMIs total {inr.format(sum)} of {inr.format(balance)} due
        {sum !== balance &&
          ` — ${sum > balance ? "reduce" : "add"} ${inr.format(Math.abs(balance - sum))}`}
        {!ordered && " · due dates must be in order"}
      </p>
      {save.isError && <Banner tone="error">{errorText(save.error)}</Banner>}
      <div className="add-payment-actions">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={submit} disabled={!valid || save.isPending}>
          {save.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CalendarClock />
              Save EMI plan
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

/** The saved EMI schedule with each installment's status. */
export function EmiSchedule({
  bill,
  billPath,
  onChange,
  onRemoved,
}: {
  bill: AppointmentBill;
  billPath: BillPath;
  onChange: () => void;
  onRemoved: (message: string) => void;
}) {
  const { clear } = useEmiPlan(billPath);
  const next = bill.installments.find((i) => i.status !== "Paid");

  return (
    <Collapsible asChild>
      <section className="emi-schedule collapse-section" aria-label="EMI schedule">
        <CollapsibleTrigger className="collapse-head emi-schedule-head">
          <span className="billing-heading">
            <ChevronRight className="collapse-chevron" aria-hidden />
            EMI schedule
            <small className="collapse-count">
              {bill.installments.length} installment{bill.installments.length === 1 ? "" : "s"}
            </small>
          </span>
          {next ? (
            <span className="emi-next">
              Next: {inr.format(next.amount - next.paid)}{" "}
              {next.status === "Overdue" ? "overdue since" : "due"} {shortDate(next.dueDate)}
            </span>
          ) : (
            <span className="emi-next emi-done">All received</span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="collapse-body">
          <ol className="emi-list">
            {bill.installments.map((i) => (
              <li key={i.number} className={`emi-${i.status.replace(" ", "-").toLowerCase()}`}>
                <span className="step-no">{i.number}</span>
                <div className="min-w-0">
                  <strong>{shortDate(i.dueDate)}</strong>
                  <small>
                    {i.paid > 0 && i.paid < i.amount
                      ? `${inr.format(i.paid)} received · ${inr.format(i.amount - i.paid)} left`
                      : i.paid >= i.amount
                        ? "Received"
                        : "Not received yet"}
                  </small>
                </div>
                <b>{inr.format(i.amount)}</b>
                <StatusChip tone={INSTALLMENT_TONE[i.status]}>{i.status}</StatusChip>
              </li>
            ))}
          </ol>
          {clear.isError && <Banner tone="error">{errorText(clear.error)}</Banner>}
          {bill.balance > 0 && (
            <div className="emi-actions">
              <button type="button" className="link-reset" onClick={onChange}>
                <CalendarClock />
                Change plan
              </button>
              <button
                type="button"
                className="link-reset danger"
                disabled={clear.isPending}
                onClick={() =>
                  clear.mutate(undefined, {
                    onSuccess: () =>
                      onRemoved("EMI plan removed. Payments already received are kept."),
                  })
                }
              >
                <Trash2 />
                Remove EMI plan
              </button>
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
