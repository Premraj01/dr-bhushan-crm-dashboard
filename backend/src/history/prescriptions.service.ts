import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_COMPLETED,
  APPOINTMENT_REOPENED,
  type Appointment,
  type PrescribedItem,
} from '../appointments/appointment.entity';
import { AuthUser } from '../auth/auth-user';
import { CrudService } from '../common/crud.service';
import { clinicDate } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import { seedPrescriptions } from '../seed/seed-data';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import {
  BLEEDING_RISK,
  Prescription,
  PrescriptionItem,
} from './history.entity';

export type PrescriptionView = Prescription & {
  /** Still being taken: not stopped, and ongoing or within its longest course. */
  active: boolean;
  /** YYYY-MM-DD the longest course ends; absent when ongoing. */
  endsOn?: string;
};

export function affectsBleeding(name: string): boolean {
  const n = name.toLowerCase();
  return BLEEDING_RISK.some((d) => n.includes(d));
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/**
 * Every prescription a patient has been given. Visit prescriptions are recorded when
 * the visit is completed and removed if completion is undone.
 */
@Injectable()
export class PrescriptionsService extends CrudService<Prescription> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    super(events, 'prescription', 'RX-', seedPrescriptions());
  }

  view(p: Prescription): PrescriptionView {
    const start = clinicDate(p.prescribedAt);
    const ongoing = p.items.some((i) => i.durationDays === undefined);
    const longest = Math.max(...p.items.map((i) => i.durationDays ?? 0));
    const endsOn = ongoing ? undefined : addDays(start, longest - 1);
    return {
      ...p,
      active: !p.stoppedAt && (ongoing || endsOn! >= clinicDate()),
      ...(endsOn && { endsOn }),
    };
  }

  list(patientId: string): PrescriptionView[] {
    this.patients.findOne(patientId);
    return this.findAll()
      .filter((p) => p.patientId === patientId)
      .sort((a, b) => b.prescribedAt.localeCompare(a.prescribedAt))
      .map((p) => this.view(p));
  }

  /** Active items across the patient's prescriptions, for the medical history and safety alerts. */
  activeItems(
    patientId: string,
  ): (PrescriptionItem & { prescriptionId: string })[] {
    return this.findAll()
      .filter((p) => p.patientId === patientId)
      .map((p) => this.view(p))
      .filter((p) => p.active)
      .flatMap((p) =>
        p.items
          .filter(
            (i) =>
              i.durationDays === undefined ||
              addDays(clinicDate(p.prescribedAt), i.durationDays - 1) >=
                clinicDate(),
          )
          .map((i) => ({ ...i, prescriptionId: p.id })),
      );
  }

  create(patientId: string, dto: CreatePrescriptionDto, user: AuthUser) {
    this.patients.findOne(patientId);
    return this.view(
      this.insert({
        patientId,
        prescribedBy: user.name,
        prescribedAt: new Date().toISOString(),
        items: dto.items.map((i) => item(i)),
        ...(dto.notes?.trim() && { notes: dto.notes.trim() }),
      }),
    );
  }

  stop(id: string, user: AuthUser) {
    const p = this.findOne(id);
    if (p.stoppedAt) throw new BadRequestException('Already stopped');
    return this.view(
      this.update(id, {
        stoppedAt: new Date().toISOString(),
        stoppedBy: user.name,
      }),
    );
  }

  @OnEvent(APPOINTMENT_COMPLETED)
  onCompleted(a: Appointment) {
    if (!a.patientId || !a.prescription?.length) return;
    const given = new Map(
      (a.medicines ?? []).map((m) => [m.itemId, m.quantity] as const),
    );
    this.insert({
      patientId: a.patientId,
      appointmentId: a.id,
      visit: a.type,
      prescribedBy: a.doctor,
      prescribedAt: a.completedAt ?? new Date().toISOString(),
      items: a.prescription.map((i) =>
        item(i, i.itemId ? given.get(i.itemId) : undefined),
      ),
    });
  }

  /** Completion undone: the visit's prescription is withdrawn with it. */
  @OnEvent(APPOINTMENT_REOPENED)
  onReopened(a: Appointment) {
    for (const p of this.findAll().filter((x) => x.appointmentId === a.id))
      this.remove(p.id);
  }
}

function item(i: PrescribedItem, dispensed?: number): PrescriptionItem {
  const text = (v: string | undefined) => v?.trim() || undefined;
  const dose = text(i.dose);
  const frequency = text(i.frequency);
  const instructions = text(i.instructions);
  return {
    name: i.name.trim(),
    ...(i.itemId && { itemId: i.itemId }),
    ...(dose && { dose }),
    ...(frequency && { frequency }),
    ...(i.durationDays && { durationDays: i.durationDays }),
    ...(instructions && { instructions }),
    ...(dispensed && { dispensed }),
    affectsBleeding: affectsBleeding(i.name),
  };
}
