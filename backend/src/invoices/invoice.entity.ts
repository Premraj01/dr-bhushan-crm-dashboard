import { Entity } from '../common/entity';

export const INVOICE_STATUSES = [
  'Paid',
  'Pending',
  'Overdue',
  'Cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface Invoice extends Entity {
  patientId?: string;
  patientName: string;
  service: string;
  /** YYYY-MM-DD */
  issuedAt: string;
  /** INR, whole rupees. */
  amount: number;
  status: InvoiceStatus;
}
