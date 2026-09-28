import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  FileText,
  LoaderCircle,
  Mail,
  MessageCircle,
  Printer,
} from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { inr } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiBlob } from "@/lib/api";
import { useBill, type AppointmentBill } from "./appointments-api";

type Action = "print" | "whatsapp" | "email" | "download";

const CLINIC = "Dr. Bhushan’s Rejuvenation";

/**
 * Phones and tablets can hand the PDF itself to WhatsApp or a mail app through the
 * share sheet. Desktop browsers can't attach files to a link, so there the PDF is
 * downloaded and WhatsApp / the mail app opens with the message ready.
 */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  if (!window.matchMedia("(pointer: coarse)").matches) return false;
  try {
    return navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/** WhatsApp wants digits with the country code; Indian 10-digit numbers get 91. */
function whatsappNumber(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

function messageFor(bill: AppointmentBill): string {
  const first = bill.patientName.split(" ")[0] ?? bill.patientName;
  const balance = bill.balance > 0 ? ` Balance due: ${inr.format(bill.balance)}.` : " Fully paid.";
  return `Hi ${first}, please find attached your invoice ${bill.invoiceId} from ${CLINIC} for ${inr.format(bill.total)}.${balance} Thank you!`;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Prints the PDF from a hidden frame, so the page stays where it is. */
function print(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // Some browsers won't print a PDF from a frame; open it so it can be printed from there.
      window.open(url, "_blank");
    }
  };
  document.body.append(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export type InvoiceMessage = { tone: "success" | "error"; text: string };

/**
 * Print, WhatsApp, Email and Download for one invoice. `bill` may still be loading
 * (`ready` is false until it — and on phones, the PDF — is there).
 */
function useInvoiceActions(
  bill: AppointmentBill | undefined,
  report: (message: InvoiceMessage | null) => void,
) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [share] = useState(canShareFiles);
  const path = `/invoices/${bill?.invoiceId}/pdf`;
  const filename = `${bill?.invoiceId}.pdf`;

  // Share sheets must open straight from the tap, so on phones the PDF is fetched up front.
  // The key changes with every payment, so the PDF always shows what's been received.
  const prefetched = useQuery({
    queryKey: ["invoice-pdf", bill?.invoiceId, bill?.total, bill?.paid],
    queryFn: () => apiBlob(path),
    enabled: share && !!bill?.invoiceId,
    staleTime: Infinity,
  });

  const pdf = async () => prefetched.data ?? (await apiBlob(path));

  const run = async (action: Action, work: (bill: AppointmentBill) => Promise<void> | void) => {
    if (!bill?.invoiceId) return;
    setBusy(action);
    report(null);
    try {
      await work(bill);
    } catch (err) {
      // Closing the share sheet isn't an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      report({
        tone: "error",
        text: "Couldn’t prepare the invoice PDF. Make sure the backend is running.",
      });
    } finally {
      setBusy(null);
    }
  };

  const shareFile = async (b: AppointmentBill, blob: Blob) => {
    const file = new File([blob], filename, { type: "application/pdf" });
    await navigator.share({
      files: [file],
      title: `Invoice ${b.invoiceId}`,
      text: messageFor(b),
    });
  };

  return {
    busy,
    ready: !!bill?.invoiceId && (!share || !!prefetched.data),
    print: () => run("print", async () => print(await pdf())),
    download: () =>
      run("download", async () => {
        save(await pdf(), filename);
        report({ tone: "success", text: `${filename} downloaded.` });
      }),
    whatsapp: () =>
      run("whatsapp", async (b) => {
        if (share) return shareFile(b, await pdf());
        // Open the chat first (still inside the click, so it isn't blocked as a pop-up).
        const number = whatsappNumber(b.contact.phone);
        window.open(
          `https://wa.me/${number}?text=${encodeURIComponent(messageFor(b))}`,
          "_blank",
          "noopener",
        );
        save(await pdf(), filename);
        report({
          tone: "success",
          text: `${filename} downloaded — attach it in the WhatsApp chat${number ? "" : " (no phone number on file, pick the contact)"}.`,
        });
      }),
    email: () =>
      run("email", async (b) => {
        if (share) return shareFile(b, await pdf());
        const subject = `Invoice ${b.invoiceId} — ${CLINIC}`;
        window.location.href = `mailto:${b.contact.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageFor(b))}`;
        save(await pdf(), filename);
        report({
          tone: "success",
          text: `${filename} downloaded — attach it to the email${b.contact.email ? "" : " (no email address on file)"}.`,
        });
      }),
  };
}

const spinnerOr = (busy: Action | null, action: Action, Icon: typeof Printer) =>
  busy === action ? <LoaderCircle className="animate-spin" /> : <Icon />;

/** Print the invoice PDF, or send it to the patient on WhatsApp or by email. */
export function InvoiceActions({ bill }: { bill: AppointmentBill }) {
  const [message, setMessage] = useState<InvoiceMessage | null>(null);
  const actions = useInvoiceActions(bill, setMessage);
  const disabled = actions.busy !== null;

  return (
    <section className="invoice-actions" aria-label="Invoice">
      <div className="invoice-actions-head">
        <span className="invoice-actions-icon">
          <FileText />
        </span>
        <div className="min-w-0">
          <strong>Invoice {bill.invoiceId}</strong>
          <small>PDF with the clinic logo, items and payments received</small>
        </div>
      </div>
      <div className="invoice-actions-buttons">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={actions.print}
        >
          {spinnerOr(actions.busy, "print", Printer)}
          Print
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={actions.whatsapp}
        >
          {spinnerOr(actions.busy, "whatsapp", MessageCircle)}
          WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={actions.email}
        >
          {spinnerOr(actions.busy, "email", Mail)}
          Email
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={actions.download}
          aria-label={`Download ${bill.invoiceId}.pdf`}
        >
          {spinnerOr(actions.busy, "download", Download)}
          Download
        </Button>
      </div>
      {message?.tone === "success" && <p className="invoice-actions-hint">{message.text}</p>}
      {message?.tone === "error" && <Banner tone="error">{message.text}</Banner>}
    </section>
  );
}

/**
 * The same invoice options as a compact menu for table rows (Billing page). The bill is
 * loaded when the pointer reaches the button or the menu opens.
 */
export function InvoiceMenu({
  invoiceId,
  onMessage,
}: {
  invoiceId: string;
  onMessage: (message: InvoiceMessage | null) => void;
}) {
  const [wanted, setWanted] = useState(false);
  const { data: bill, isError } = useBill(`/invoices/${invoiceId}`, wanted);
  const actions = useInvoiceActions(bill, onMessage);
  const disabled = !actions.ready || actions.busy !== null;

  const item = (action: Action, label: string, Icon: typeof Printer, onSelect: () => void) => (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect}>
      {spinnerOr(actions.busy, action, Icon)}
      {label}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu onOpenChange={(open) => open && setWanted(true)}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onPointerEnter={() => setWanted(true)}
          onFocus={() => setWanted(true)}
          aria-label={`Invoice ${invoiceId}: print, send or download`}
        >
          {actions.busy ? <LoaderCircle className="animate-spin" /> : <FileText />}
          Invoice
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>
          {invoiceId}
          <small className="block font-normal text-muted-foreground">
            {isError ? "Couldn’t load this invoice" : actions.ready ? "PDF invoice" : "Preparing…"}
          </small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {item("print", "Print", Printer, actions.print)}
        {item("whatsapp", "Send on WhatsApp", MessageCircle, actions.whatsapp)}
        {item("email", "Send by email", Mail, actions.email)}
        <DropdownMenuSeparator />
        {item("download", "Download PDF", Download, actions.download)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
