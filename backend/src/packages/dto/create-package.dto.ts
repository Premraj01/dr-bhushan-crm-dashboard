import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  Matches,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STEP_KINDS, type StepKind } from '../package.entity';

export class TransplantItemDto {
  /** Grafts planned for FUE. */
  @IsInt()
  @Min(100)
  @Max(8000)
  grafts: number;

  /** Overrides the per-graft price from Settings for this package only. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  pricePerGraft?: number;
}

export class CreatePackageDto {
  /** Paid PRP sessions (complimentary sessions from a transplant are added automatically). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  prpSessions?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransplantItemDto)
  transplant?: TransplantItemDto;

  /** First session date, YYYY-MM-DD. Defaults to today (clinic time). */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'startDate must be a YYYY-MM-DD date',
  })
  startDate?: string;

  /** Clinic-local time the sessions are booked for, HH:mm (default 10:00). */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'sessionTime must be HH:mm',
  })
  sessionTime?: string;

  /** Doctor to book the sessions with (defaults to the creator). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  doctor?: string;

  /** Months between consecutive sessions (default 3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  intervalMonths?: number;

  /**
   * Session order, e.g. ["transplant", "prp-free", "prp-free", "prp-free"].
   * Must list every session in the package exactly once. Defaults to transplant →
   * complimentary PRP → paid PRP.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsIn(STEP_KINDS, { each: true })
  sequence?: StepKind[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
