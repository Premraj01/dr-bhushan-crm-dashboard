import { IsIn, IsOptional, IsString } from 'class-validator';
import { INVOICE_STATUSES, type InvoiceStatus } from '../invoice.entity';

export class ListInvoicesQuery {
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;

  /** Only this patient's invoices (the patient history's financial records). */
  @IsOptional()
  @IsString()
  patientId?: string;
}
