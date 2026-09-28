import { Entity } from '../common/entity';

/** Internal event: an invoice was opened or changed (AppointmentsService mirrors a visit's bill status). */
export const INVOICE_CHANGED = 'invoice.changed';

export const INVOICE_STATUSES = [
  'Paid',
  'Partially paid',
  'Pending',
  'Overdue',
  'Cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** An EMI (part-payment) plan over the balance that was due when it was set up. */
export interface EmiPlan {
  installments: { dueDate: string; amount: number }[];
  /** `paid` when the plan was set up; later payments are applied to installments in order. */
  paidAtStart: number;
  createdBy: string;
  createdAt: string;
}

/** One row on an invoice: the visit's treatment, or a medicine/product given at the visit. */
export interface InvoiceLine {
  kind: 'service' | 'medicine';
  description: string;
  quantity: number;
  /** INR per unit; medicines can have paise. */
  unitPrice: number;
  /** quantity × unitPrice, to the paisa. */
  amount: number;
  /** Inventory SKU, for medicines. */
  itemId?: string;
  batchNo?: string;
}

/** Invoice total: the lines' sum rounded to whole rupees (payments are in rupees). */
export function invoiceTotal(lines: InvoiceLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.amount, 0));
}

export interface Invoice extends Entity {
  patientId?: string;
  patientName: string;
  service: string;
  /** YYYY-MM-DD */
  issuedAt: string;
  /** INR, whole rupees (the lines' sum, rounded). */
  amount: number;
  /**
   * What the invoice is for. Absent on older invoices, which are a single service line
   * (`service` × `amount`).
   */
  items?: InvoiceLine[];
  /** Received so far (sum of payments), INR. */
  paid: number;
  status: InvoiceStatus;
  /** One invoice per treatment package… */
  packageId?: string;
  /** …or per stand-alone visit. */
  appointmentId?: string;
  /** Present when the balance is being paid in EMIs; null once removed. */
  emi?: EmiPlan | null;
}
