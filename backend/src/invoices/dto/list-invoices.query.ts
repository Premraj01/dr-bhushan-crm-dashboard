import { IsIn, IsOptional } from 'class-validator';
import { INVOICE_STATUSES, type InvoiceStatus } from '../invoice.entity';

export class ListInvoicesQuery {
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;
}
