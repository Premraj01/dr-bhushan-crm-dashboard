import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TREATMENT_STATUSES,
  TREATMENT_TYPES,
  type TreatmentStatus,
  type TreatmentType,
} from '../treatment.entity';

export class CreateTreatmentDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsIn(TREATMENT_TYPES)
  type: TreatmentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  plan: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sessionsCompleted?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sessionsTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  grafts?: number;

  /** Defaults to today (clinic time). */
  @IsOptional()
  @IsDateString({ strict: true })
  lastSessionAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  outcome?: string;

  @IsOptional()
  @IsIn(TREATMENT_STATUSES)
  status?: TreatmentStatus;
}
