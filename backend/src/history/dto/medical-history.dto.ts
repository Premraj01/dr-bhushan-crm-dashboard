import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CLEARANCE_STATUSES,
  CONDITION_STATUSES,
  SEVERITIES,
  type ClearanceStatus,
  type ConditionStatus,
  type Severity,
} from '../history.entity';

export class AllergyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  substance: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reaction?: string;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: Severity;
}

export class ConditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(CONDITION_STATUSES)
  status: ConditionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class MedicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dose?: string;

  @IsBoolean()
  affectsBleeding: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class PastSurgeryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  procedure: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  when?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

/** Replaces the whole medical section. */
export class MedicalHistoryDto {
  @IsBoolean()
  noKnownAllergies: boolean;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AllergyDto)
  allergies: AllergyDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications: MedicationDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PastSurgeryDto)
  surgeries: PastSurgeryDto[];

  @IsIn(CLEARANCE_STATUSES)
  clearance: ClearanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clearanceNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
