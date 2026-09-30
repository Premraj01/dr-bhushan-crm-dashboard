import { useState } from "react";
import { ArrowLeft, ChevronRight, Receipt } from "lucide-react";
import { Banner, StatusChip, type Tone } from "@/components/crm-ui";
import { BillingSection } from "@/components/appointments/billing-section";
import { PackageCard } from "@/components/patients/patient-dialogs";
import { usePackages } from "@/components/patients/patients-api";
import { inr } from "@/components/settings/catalog-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { usePatientInvoices, type InvoiceStatus } from "./history-api";
import { errorText } from "@/lib/api";
import { longDate } from "./format";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  Paid: "success",
  "Partially paid": "warning",
  Pending: "warning",
  Overdue: "error",
  Cancelled: "neutral",
};

/** Invoices, receipts, EMI plans and packages — the same records as the Billing page. */
export function FinancialTab({
  patientId,
  onNotice,
}: {
  patientId: string;
  onNotice: (message: string) => void;
}) {
  const invoices = usePatientInvoices(patientId);
  const packages = usePackages(patientId);
  const [open, setOpen] = useState<string | null>(null);

  if (open) {
    return (
      <div>
        <button type="button" className="link-reset billing-back" onClick={() => setOpen(null)}>
          <ArrowLeft />
          All financial records
        </button>
        <BillingSection
          key={open}
          target={{ invoiceId: open }}
          onReceived={(message) => onNotice(message)}
        />
      </div>
    );
  }

  const list = (invoices.data ?? []).filter((i) => i.status !== "Cancelled");
  const billed = list.reduce((s, i) => s + i.amount, 0);
  const paid = list.reduce((s, i) => s + i.paid, 0);

  return (
    <div className="financial-tab">
      <div className="consent-status">
        <div>
          <span>Billed</span>
          <strong>{inr.format(billed)}</strong>
        </div>
        <div>
          <span>Received</span>
          <strong>{inr.format(paid)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong className={billed - paid > 0 ? "text-destructive" : undefined}>
            {inr.format(Math.max(0, billed - paid))}
          </strong>
        </div>
      </div>

      <section>
        <h4 className="history-subhead">Invoices & receipts</h4>
        {invoices.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : invoices.isError ? (
          <Banner tone="error">{errorText(invoices.error)}</Banner>
        ) : invoices.data.length === 0 ? (
          <p className="history-empty">No invoices yet.</p>
        ) : (
          <div className="invoice-list">
            {invoices.data.map((i) => (
              <button type="button" key={i.id} onClick={() => setOpen(i.id)}>
                <Receipt />
                <span className="min-w-0">
                  <strong>{i.service}</strong>
                  <small>
                    {i.id} · issued {longDate(i.issuedAt)}
                    {i.emi &&
                      i.emi.installments.length > 0 &&
                      ` · EMI in ${i.emi.installments.length} installments`}
                  </small>
                </span>
                <span className="invoice-amount">
                  <strong>{inr.format(i.amount)}</strong>
                  <small>{inr.format(i.paid)} paid</small>
                </span>
                <StatusChip tone={STATUS_TONE[i.status]}>{i.status}</StatusChip>
                <ChevronRight className="row-arrow" />
              </button>
            ))}
          </div>
        )}
        <p className="field-note">Open an invoice for its payments, receipts, EMI plan and PDF.</p>
      </section>

      <section>
        <h4 className="history-subhead">Treatment packages</h4>
        {packages.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : packages.isError ? (
          <Banner tone="error">{errorText(packages.error)}</Banner>
        ) : packages.data.length === 0 ? (
          <p className="history-empty">No packages yet.</p>
        ) : (
          packages.data.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)
        )}
      </section>
    </div>
  );
}
