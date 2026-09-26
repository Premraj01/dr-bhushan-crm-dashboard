import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { seedLeads } from '../seed/seed-data';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQuery } from './dto/list-leads.query';
import { Lead } from './lead.entity';

@Injectable()
export class LeadsService extends CrudService<Lead> {
  constructor(events: EventEmitter2) {
    super(events, 'lead', 'LD-', seedLeads);
  }

  list({ stage }: ListLeadsQuery): Lead[] {
    return this.findAll().filter((l) => !stage || l.stage === stage);
  }

  create(dto: CreateLeadDto): Lead {
    return this.insert({
      ...dto,
      value: dto.value ?? 0,
      nextAction: dto.nextAction ?? 'Call today',
      stage: dto.stage ?? 'New',
    });
  }
}
