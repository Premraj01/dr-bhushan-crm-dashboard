import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DONOR_LAXITIES,
  DONOR_QUALITIES,
  HAIR_SCALES,
  type HairScale,
} from '../history.entity';

export class DonorAssessmentDto {
  @IsOptional()
  @IsIn(DONOR_QUALITIES)
  quality?: (typeof DONOR_QUALITIES)[number];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(300)
  density?: number;

  @IsOptional()
  @IsIn(DONOR_LAXITIES)
  laxity?: (typeof DONOR_LAXITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PreviousTreatmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  treatment: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  outcome?: string;
}

export class PatientGoalsDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hairline?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  targetGrafts?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  densityNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  expectations?: string;
}

/** Replaces the whole hair section. The grade is checked against the scale. */
export class HairAssessmentDto {
  @IsIn(HAIR_SCALES)
  scale: HairScale;

  @IsString()
  @IsNotEmpty()
  grade: string;

  @ValidateNested()
  @Type(() => DonorAssessmentDto)
  donor: DonorAssessmentDto;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PreviousTreatmentDto)
  treatments: PreviousTreatmentDto[];

  @ValidateNested()
  @Type(() => PatientGoalsDto)
  goals: PatientGoalsDto;
}
