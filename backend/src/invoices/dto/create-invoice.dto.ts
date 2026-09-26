import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { INVOICE_STATUSES, type InvoiceStatus } from '../invoice.entity';

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  service: string;

  /** INR, whole rupees. */
  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;
}
