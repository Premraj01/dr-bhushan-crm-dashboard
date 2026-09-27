import { Entity } from '../common/entity';

export const PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Card',
  'Bank transfer',
  'Cheque',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Money received against an invoice. */
export interface Payment extends Entity {
  invoiceId: string;
  patientId?: string;
  patientName: string;
  /** INR, whole rupees. */
  amount: number;
  method: PaymentMethod;
  /** UPI transaction id, card slip, cheque number… */
  reference?: string;
  note?: string;
  receivedBy: { id: string; name: string };
  /** When the money was received (ISO). */
  receivedAt: string;
}
