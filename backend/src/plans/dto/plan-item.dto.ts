import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GAP_UNITS, type GapUnit } from '../plan.entity';

export class GapDto {
  @IsInt()
  @Min(0)
  @Max(365)
  value: number;

  @IsIn(GAP_UNITS)
  unit: GapUnit;
}

/** Everything a step has besides its treatment. */
class StepFieldsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GapDto)
  gap?: GapDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  windowDays?: number;

  @IsOptional()
  @IsBoolean()
  complimentary?: boolean;

  /** INR per unit for this package; 0 waives the cost. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  unitPrice?: number;

  /** e.g. grafts for a per-graft treatment. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class PlanStepDto extends StepFieldsDto {
  @IsString()
  @IsNotEmpty()
  treatmentId: string;
}

/** A single step (`treatmentId`), or a block of steps (`steps` + `repeat`). */
export class PlanItemDto extends StepFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  treatmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  repeat?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PlanStepDto)
  steps?: PlanStepDto[];
}

export class PlanItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  items: PlanItemDto[];
}
