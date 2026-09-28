import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { clinicDate } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import { seedTreatments } from '../seed/seed-data';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { Treatment } from './treatment.entity';

@Injectable()
export class TreatmentsService extends CrudService<Treatment> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    super(events, 'treatment', 'TR-', seedTreatments());
  }

  list(): Treatment[] {
    return this.findAll().sort((a, b) =>
      b.lastSessionAt.localeCompare(a.lastSessionAt),
    );
  }

  create(dto: CreateTreatmentDto): Treatment {
    const patient = this.patients.findOne(dto.patientId);
    return this.insert({
      ...dto,
      patientName: patient.name,
      lastSessionAt: dto.lastSessionAt ?? clinicDate(),
      status: dto.status ?? 'Active',
    });
  }
}
