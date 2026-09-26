import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  type LeadSource,
  type LeadStage,
} from '../lead.entity';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @Matches(/^\+?[0-9][0-9 -]{6,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsIn(LEAD_SOURCES)
  source: LeadSource;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  interest: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nextAction?: string;

  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
