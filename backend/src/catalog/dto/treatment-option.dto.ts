import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TREATMENT_TYPES,
  type TreatmentType,
} from '../../treatments/treatment.entity';
import {
  DURATION_UNITS,
  PRICING_UNITS,
  type DurationUnit,
  type PricingUnit,
} from '../catalog.entity';

export class CreateTreatmentOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsIn(TREATMENT_TYPES)
  category: TreatmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  sessions?: number;

  /** INR, whole rupees. */
  @IsInt()
  @Min(0)
  price: number;

  /** What `price` is charged per. Defaults to "session". */
  @IsOptional()
  @IsIn(PRICING_UNITS)
  pricingUnit?: PricingUnit;

  /** Length in `durationUnit`; the lower bound when `durationMax` is set. */
  @IsInt()
  @Min(1)
  @Max(720)
  duration: number;

  /** Upper bound for a range, e.g. 2 for "1–2 days"; null clears it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  durationMax?: number | null;

  @IsIn(DURATION_UNITS)
  durationUnit: DurationUnit;

  /** Surgery: scheduled from the package into a theatre slot. */
  @IsOptional()
  @IsBoolean()
  surgical?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTreatmentOptionDto extends PartialType(
  CreateTreatmentOptionDto,
) {}
