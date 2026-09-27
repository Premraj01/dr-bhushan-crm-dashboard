import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PlanItemsDto } from './plan-item.dto';

export class CreateTreatmentPlanDto extends PlanItemsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTreatmentPlanDto extends PartialType(
  CreateTreatmentPlanDto,
) {}
