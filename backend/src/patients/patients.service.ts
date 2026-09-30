import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { clinicDate } from '../common/dates';
import { NewEntity } from '../common/entity';
import { seedPatients } from '../seed/seed-data';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQuery } from './dto/list-patients.query';
import { Patient } from './patient.entity';

@Injectable()
export class PatientsService extends CrudService<Patient> {
  constructor(events: EventEmitter2) {
    super(events, 'patient', 'PT-', seedPatients());
  }

  /** Age is always worked out from the date of birth when there is one. */
  override findAll(): Patient[] {
    return super.findAll().map(withAge);
  }

  override findOne(id: string): Patient {
    return withAge(super.findOne(id));
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
    assertBirthDate(dto.dateOfBirth);
    const record = withName({
      ...dto,
      treatment: dto.treatment ?? 'Consultation',
    } as NewEntity<Patient>);
    return withAge(this.insert(record));
  }

  override update(id: string, patch: Partial<NewEntity<Patient>>): Patient {
    assertBirthDate(patch.dateOfBirth);
    if (
      patch.firstName !== undefined ||
      patch.middleName !== undefined ||
      patch.lastName !== undefined
    ) {
      patch = { ...patch, name: fullName({ ...super.findOne(id), ...patch }) };
    }
    return withAge(super.update(id, patch));
  }
}

function assertBirthDate(date: string | undefined) {
  if (date && date > clinicDate()) {
    throw new BadRequestException('dateOfBirth cannot be in the future');
  }
}

/** "First Middle Last" when the name parts are known, otherwise the stored name. */
function fullName(
  p: Pick<Patient, 'name' | 'firstName' | 'middleName' | 'lastName'>,
): string {
  if (!p.firstName) return p.name;
  return [p.firstName, p.middleName, p.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
}

function withName<T extends NewEntity<Patient>>(p: T): T {
  return { ...p, name: fullName(p) };
}

function withAge(p: Patient): Patient {
  if (!p.dateOfBirth) return p;
  const today = clinicDate();
  const [y, m, d] = p.dateOfBirth.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return { ...p, age };
}

/** Last visit, or the registration date for patients who haven't visited yet. */
function recency(p: Patient): string {
  return p.lastVisit ?? p.createdAt.slice(0, 10);
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
