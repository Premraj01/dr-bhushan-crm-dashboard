import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class InstallmentDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'dueDate must be a YYYY-MM-DD date',
  })
  dueDate: string;

  /** INR, whole rupees. */
  @IsInt()
  @Min(1)
  amount: number;
}

/** Splits the current balance into EMIs. The installments must add up to the balance. */
export class EmiPlanDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  installments: InstallmentDto[];

  /** Visit charge, only when the visit isn't billed yet and has no price in Settings. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  charge?: number;
}
