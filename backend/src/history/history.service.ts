import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '../auth/auth-user';
import { CrudService } from '../common/crud.service';
import { PatientsService } from '../patients/patients.service';
import { seedHistories } from '../seed/seed-data';
import { HairAssessmentDto } from './dto/hair-assessment.dto';
import { MedicalHistoryDto } from './dto/medical-history.dto';
import { HAIR_GRADES, PatientHistory } from './history.entity';

/** Medical baseline and hair assessment, one record per patient (id = patient id). */
@Injectable()
export class HistoryService extends CrudService<PatientHistory> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    super(events, 'history', 'HX-', seedHistories());
  }

  get(
    patientId: string,
  ): Pick<PatientHistory, 'patientId' | 'medical' | 'hair'> {
    this.patients.findOne(patientId);
    const { medical, hair } = this.repo.findOne(patientId) ?? {};
    return { patientId, medical, hair };
  }

  setMedical(patientId: string, dto: MedicalHistoryDto, user: AuthUser) {
    if (dto.noKnownAllergies && dto.allergies.length) {
      throw new BadRequestException(
        'Remove the listed allergies or untick "No known drug allergies"',
      );
    }
    return this.save(patientId, { medical: { ...dto, ...edited(user) } });
  }

  setHair(patientId: string, dto: HairAssessmentDto, user: AuthUser) {
    if (!HAIR_GRADES[dto.scale].includes(dto.grade)) {
      throw new BadRequestException(
        `${dto.grade} is not a ${dto.scale} grade (${HAIR_GRADES[dto.scale].join(', ')})`,
      );
    }
    return this.save(patientId, { hair: { ...dto, ...edited(user) } });
  }

  private save(patientId: string, section: Partial<PatientHistory>) {
    this.patients.findOne(patientId);
    if (this.repo.findOne(patientId)) this.update(patientId, section);
    else this.insert({ patientId, ...section }, patientId);
    return this.get(patientId);
  }
}

function edited(user: AuthUser) {
  return {
    updatedBy: { id: user.id, name: user.name },
    updatedAt: new Date().toISOString(),
  };
}
