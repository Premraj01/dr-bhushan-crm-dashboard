import { Entity } from '../common/entity';

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

export interface Invoice extends Entity {
  patientId?: string;
  patientName: string;
  service: string;
  /** YYYY-MM-DD */
  issuedAt: string;
  /** INR, whole rupees. */
  amount: number;
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
