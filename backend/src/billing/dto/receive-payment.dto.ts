import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../invoices/payment.entity';

export class ReceivePaymentDto {
  /** INR, whole rupees; can't exceed the balance. */
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amount: number;

  @IsIn(PAYMENT_METHODS)
  method: PaymentMethod;

  /** UPI transaction id, card slip or cheque number. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Visit charge in INR, used only when the visit has no bill yet and its price
   * isn't in Settings → Treatments (e.g. "Post-op review").
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  charge?: number;
}
