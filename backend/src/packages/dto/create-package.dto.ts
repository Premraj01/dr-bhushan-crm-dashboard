import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlanItemsDto } from '../../plans/dto/plan-item.dto';

/**
 * A package: the plan's steps (usually copied from a Settings plan, then adjusted for
 * this patient — order, gaps, prices, free sessions). Nothing is booked on creation.
 */
export class CreatePackageDto extends PlanItemsDto {
  /** The Settings plan it started from, if any. */
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** YYYY-MM-DD the first visit is due; defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  @MaxLength(10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
