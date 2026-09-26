import { ConflictException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { seedPatients } from '../seed/seed-data';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQuery } from './dto/list-patients.query';
import { Patient } from './patient.entity';

@Injectable()
export class PatientsService extends CrudService<Patient> {
  constructor(events: EventEmitter2) {
    super(events, 'patient', 'PT-', seedPatients);
  }

  list({ search }: ListPatientsQuery): Patient[] {
    const q = search?.trim().toLowerCase();
    return this.findAll()
      .filter(
        (p) => !q || `${p.name} ${p.id} ${p.phone}`.toLowerCase().includes(q),
      )
      .sort((a, b) => recency(b).localeCompare(recency(a)));
  }

  /** Same number regardless of spaces, dashes or a +91 prefix. */
  findByPhone(phone: string): Patient | undefined {
    const key = phoneKey(phone);
    return this.findAll().find((p) => phoneKey(p.phone) === key);
  }

  create(dto: CreatePatientDto): Patient {
    const existing = this.findByPhone(dto.phone);
    if (existing) {
      throw new ConflictException(
        `${existing.name} (${existing.id}) is already registered with this phone number`,
      );
    }
    return this.insert({ ...dto, treatment: dto.treatment ?? 'Consultation' });
  }
}

/** Last visit, or the registration date for patients who haven't visited yet. */
function recency(p: Patient): string {
  return p.lastVisit ?? p.createdAt.slice(0, 10);
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
