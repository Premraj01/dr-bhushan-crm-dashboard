import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, IndianRupee, LoaderCircle, RefreshCw } from "lucide-react";
import { Banner, StatusChip, type Tone } from "@/components/crm-ui";
import { inr } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHODS,
  clinicTimeOf,
  useBill,
  useReceivePayment,
  type Appointment,
  type AppointmentBill,
  type BillPath,
  type PaymentMethod,
} from "./appointments-api";
import { EmiPlanner, EmiSchedule } from "./emi-plan";

const STATUS_TONE: Record<AppointmentBill["status"], Tone> = {
  Paid: "success",
  "Partially paid": "warning",
  Pending: "neutral",
  "Not billed": "neutral",
  Overdue: "error",
  Cancelled: "error",
};

const REFERENCE_HINT: Record<PaymentMethod, string> = {
  Cash: "Optional — receipt number",
  UPI: "UPI transaction ID",
  Card: "Last 4 digits or slip number",
  "Bank transfer": "UTR / NEFT reference",
  Cheque: "Cheque number",
};

function paidOn(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} · ${clinicTimeOf(iso)}`;
}

/** A bill opened from the calendar (an appointment) or from the Billing page (an invoice). */
export type BillTarget = { appointment: Appointment } | { invoiceId: string };

function pathOf(target: BillTarget): BillPath {
  return "appointment" in target
    ? `/appointments/${target.appointment.id}`
    : `/invoices/${target.invoiceId}`;
}

/** Billing for an appointment or invoice: what's owed, payments so far, and "Payment received". */
export function BillingSection({
  target,
  onBack,
  onReceived,
}: {
  target: BillTarget;
  onBack?: (() => void) | undefined;
  onReceived: (message: string) => void;
}) {
  const { data: bill, isPending, isError, refetch, isRefetching } = useBill(pathOf(target));
  // "full" = one payment for what's due; "emi" = schedule part payments.
  const [mode, setMode] = useState<"full" | "emi" | null>(null);
  const [replanning, setReplanning] = useState(false);

  if (isPending) return <Skeleton className="mt-4 h-72 w-full" />;
  if (isError) {
    return (
      <div className="mt-4 table-error">
        <Banner tone="error">Couldn’t load this bill.</Banner>
        <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="billing-section">
      {onBack && (
        <button type="button" className="link-reset billing-back" onClick={onBack}>
          <ArrowLeft />
          Appointment details
        </button>
      )}

      <section className="billing-summary" aria-label="Payment details">
        <header>
          <div className="min-w-0">
            <strong>{bill.description}</strong>
            <small>
              {bill.source === "package"
                ? "Plan visit — billed on its own; pay for this visit only"
                : "appointment" in target
                  ? `Visit on ${new Date(target.appointment.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`
                  : `${bill.invoiceId}${bill.issuedAt ? ` · issued ${new Date(`${bill.issuedAt}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}`}
            </small>
          </div>
          {bill.complimentary ? (
            <StatusChip tone="success">Complimentary</StatusChip>
          ) : (
            <StatusChip tone={STATUS_TONE[bill.status]}>{bill.status}</StatusChip>
          )}
        </header>
        <dl className="billing-figures">
          <div>
            <dt>Total</dt>
            <dd>{bill.needsCharge ? "To be entered" : inr.format(bill.total)}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{inr.format(bill.paid)}</dd>
          </div>
          <div className={bill.balance > 0 ? "due" : "clear"}>
            <dt>Balance</dt>
            <dd>{bill.needsCharge ? "—" : inr.format(bill.balance)}</dd>
          </div>
        </dl>
      </section>

      {(() => {
        const open = !bill.complimentary && (bill.balance > 0 || bill.needsCharge);
        const paymentType = mode ?? bill.plan;
        const planning = open && ((paymentType === "emi" && bill.plan === "full") || replanning);
        return (
          <>
            {open && bill.plan === "full" && (
              <div className="payment-type" role="radiogroup" aria-label="Payment type">
                {(
                  [
                    ["full", "Full payment", "Collect what’s due now"],
                    ["emi", "EMI", "Schedule part payments"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={paymentType === value}
                    className={cn(paymentType === value && "active")}
                    onClick={() => setMode(value)}
                  >
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
            )}
            {planning && (
              <EmiPlanner
                key={`${bill.paid}-${bill.balance}`}
                bill={bill}
                billPath={pathOf(target)}
                onCancel={() => {
                  setReplanning(false);
                  if (bill.plan === "full") setMode("full");
                }}
                onSaved={(message) => {
                  setReplanning(false);
                  setMode(null);
                  onReceived(message);
                }}
              />
            )}
            {bill.plan === "emi" && !replanning && (
              <EmiSchedule
                bill={bill}
                billPath={pathOf(target)}
                onChange={() => setReplanning(true)}
                onRemoved={(message) => {
                  setMode("full");
                  onReceived(message);
                }}
              />
            )}
          </>
        );
      })()}

      <section aria-label="Payments received">
        <h4 className="billing-heading">Payments</h4>
        {bill.payments.length === 0 ? (
          <p className="package-empty">No payments received yet.</p>
        ) : (
          <ol className="payment-list">
            {bill.payments.map((p) => (
              <li key={p.id}>
                <span className="payment-icon">
                  <IndianRupee />
                </span>
                <div className="min-w-0">
                  <strong>
                    {p.method}
                    {p.reference && <span className="payment-ref">{p.reference}</span>}
                  </strong>
                  <small>
                    {paidOn(p.receivedAt)} · received by {p.receivedBy.name}
                    {p.note && ` · ${p.note}`}
                  </small>
                </div>
                <b>{inr.format(p.amount)}</b>
              </li>
            ))}
          </ol>
        )}
      </section>

      {((mode ?? bill.plan) === "emi" && bill.plan === "full") ||
      replanning ? null : !bill.complimentary && (bill.balance > 0 || bill.needsCharge) ? (
        <AddPayment
          key={`${bill.paid}-${bill.plan}-${bill.installments.length}`}
          bill={bill}
          billPath={pathOf(target)}
          onReceived={onReceived}
        />
      ) : bill.complimentary ? (
        <div className="billing-paid">
          <CheckCircle2 />
          Free in the treatment plan — nothing to pay for this visit.
        </div>
      ) : (
        <div className="billing-paid">
          <CheckCircle2 />
          Fully paid — nothing due.
        </div>
      )}
    </div>
  );
}

function AddPayment({
  bill,
  billPath,
  onReceived,
}: {
  bill: AppointmentBill;
  billPath: BillPath;
  onReceived: (message: string) => void;
}) {
  const receive = useReceivePayment(billPath);
  const [charge, setCharge] = useState("");
  const nextEmi = bill.installments.find((i) => i.status !== "Paid");
  const [amount, setAmount] = useState(
    bill.needsCharge ? "" : String(nextEmi ? nextEmi.amount - nextEmi.paid : bill.balance),
  );
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const due = bill.needsCharge ? Number(charge) || 0 : bill.balance;
  const value = Number(amount);
  const tooMuch = due > 0 && value > due;
  const valid =
    Number.isInteger(value) && value > 0 && !tooMuch && (!bill.needsCharge || Number(charge) > 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    receive.mutate(
      {
        amount: value,
        method,
        ...(reference.trim() && { reference: reference.trim() }),
        ...(note.trim() && { note: note.trim() }),
        ...(bill.needsCharge && { charge: Number(charge) }),
      },
      {
        onSuccess: (updated) =>
          onReceived(
            `Payment received: ${inr.format(value)} by ${method}.` +
              (updated.balance > 0 ? ` Balance ${inr.format(updated.balance)}.` : " Fully paid."),
          ),
      },
    );
  };

  const error =
    receive.error instanceof ApiError
      ? receive.error.message
      : receive.error
        ? "Couldn’t reach the clinic server. Make sure the backend is running."
        : null;

  return (
    <form className="add-payment" onSubmit={submit} noValidate>
      <h4 className="billing-heading">
        Add payment
        {nextEmi && (
          <small className="billing-heading-hint">
            {" "}
            · EMI {nextEmi.number} of {bill.installments.length}
          </small>
        )}
      </h4>
      <div className="form-grid">
        {bill.needsCharge && (
          <label className="full">
            Visit charge (₹)
            <input
              required
              type="number"
              inputMode="numeric"
              min={1}
              value={charge}
              onChange={(e) => {
                setCharge(e.target.value);
                if (!amount || amount === charge) setAmount(e.target.value);
              }}
              placeholder="This visit isn’t priced in Settings — enter the charge"
            />
          </label>
        )}
        <label>
          Amount (₹)
          <input
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={due || undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={tooMuch}
          />
        </label>
        <label>
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Reference
          <input
            maxLength={80}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={REFERENCE_HINT[method]}
          />
        </label>
        <label className="full">
          Note
          <input
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </label>
      </div>
      {tooMuch && <p className="field-hint">That’s more than the balance of {inr.format(due)}.</p>}
      {error && <Banner tone="error">{error}</Banner>}
      <div className="add-payment-actions">
        {!bill.needsCharge && value !== bill.balance && (
          <button
            type="button"
            className="link-reset"
            onClick={() => setAmount(String(bill.balance))}
          >
            Pay full balance ({inr.format(bill.balance)})
          </button>
        )}
        <Button type="submit" disabled={!valid || receive.isPending}>
          {receive.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 />
              Payment received
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
