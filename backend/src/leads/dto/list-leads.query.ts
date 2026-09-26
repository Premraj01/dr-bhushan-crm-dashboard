import { IsIn, IsOptional } from 'class-validator';
import { LEAD_STAGES, type LeadStage } from '../lead.entity';

export class ListLeadsQuery {
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;
}
