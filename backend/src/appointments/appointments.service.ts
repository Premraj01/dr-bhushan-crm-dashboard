import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { NewEntity } from '../common/entity';
import { addDays, clinicDate } from '../common/dates';
import { INVOICE_CHANGED, type Invoice } from '../invoices/invoice.entity';
import { PatientsService } from '../patients/patients.service';
import { seedAppointments } from '../seed/seed-data';
import {
  APPOINTMENT_BOOKED,
  APPOINTMENT_COMPLETED,
  APPOINTMENT_REOPENED,
  Appointment,
} from './appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQuery } from './dto/list-appointments.query';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService
  extends CrudService<Appointment>
  implements OnModuleInit, OnModuleDestroy
{
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    super(events, 'appointment', 'APT-', seedAppointments());
  }

  /** Re-check for missed visits every 10 minutes so open screens update after midnight. */
  onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweepMissed(), 10 * 60_000);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  /** Every read sees Missed applied first. */
  override findAll(): Appointment[] {
    this.sweepMissed();
    return super.findAll();
  }

  /**
   * After midnight, a visit still Scheduled/Rescheduled for an earlier day is Missed.
   * Missed visits stay editable: reschedule them, or check the patient in if they did come.
   */
  sweepMissed() {
    const today = clinicDate();
    for (const a of this.repo.findAll()) {
      if (isUpcoming(a) && spanOf(a).first < today)
        super.update(a.id, { status: 'Missed' });
    }
  }

  list({
    date,
    month,
    patientId,
    doctor,
    status,
  }: ListAppointmentsQuery): Appointment[] {
    return (
      this.findAll()
        // Multi-day surgery shows up on every day it covers.
        .filter(
          (a) => !date || (spanOf(a).first <= date && date <= spanOf(a).last),
        )
        .filter(
          (a) =>
            !month ||
            (spanOf(a).first.slice(0, 7) <= month &&
              month <= spanOf(a).last.slice(0, 7)),
        )
        .filter((a) => !patientId || a.patientId === patientId)
        .filter((a) => !doctor || a.doctor === doctor)
        .filter((a) => !status || a.status === status)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    );
  }

  create({ newPatient, ...dto }: CreateAppointmentDto): Appointment {
    if (newPatient && dto.patientId) {
      throw new BadRequestException(
        'Send either patientId or newPatient, not both',
      );
    }
    // Registering first means a duplicate phone number fails before anything is booked.
    const patientId = newPatient
      ? this.patients.create(newPatient).id
      : dto.patientId;
    this.assertTheatreFree({ startsAt: dto.startsAt, days: dto.days });
    const created = this.insert({
      ...dto,
      ...(patientId && { patientId }),
      patientName: this.resolvePatientName(patientId, dto.patientName),
      startsAt: new Date(dto.startsAt).toISOString(),
      durationMinutes: dto.durationMinutes ?? 30,
      status: 'Scheduled',
    });
    // A visit for a treatment in the patient's plan gets linked to that step (PackagesService).
    this.events.emit(APPOINTMENT_BOOKED, created);
    return this.findOne(created.id);
  }

  /** Link (or with null, unlink) an appointment to a package step — PackagesService only. */
  linkToPackage(
    id: string,
    packageId: string | null,
    packageStep: number | null,
  ) {
    return super.update(id, { packageId, packageStep });
  }

  override update(
    id: string,
    { newPatient, ...dto }: UpdateAppointmentDto,
  ): Appointment {
    const current = this.findOne(id);
    // A completed visit is a record of what happened — it can't be changed.
    if (current.status === 'Completed') {
      throw new BadRequestException('Completed appointments can’t be edited');
    }
    if (newPatient && dto.patientId) {
      throw new BadRequestException(
        'Send either patientId or newPatient, not both',
      );
    }
    const changingPatient =
      !!newPatient ||
      (dto.patientId !== undefined && dto.patientId !== current.patientId);
    if (current.packageId && changingPatient) {
      throw new BadRequestException(
        `This session belongs to package ${current.packageId}; it can't be moved to another patient`,
      );
    }
    const moving =
      dto.startsAt !== undefined &&
      new Date(dto.startsAt).toISOString() !== current.startsAt;
    if (moving && !isOpen(current)) {
      throw new BadRequestException(
        `This appointment is already ${current.status.toLowerCase()} and can't be rescheduled`,
      );
    }
    if (dto.startsAt !== undefined || dto.days !== undefined) {
      this.assertTheatreFree(
        {
          startsAt: dto.startsAt ?? current.startsAt,
          days: dto.days ?? current.days,
        },
        id,
      );
    }
    const patientId = newPatient
      ? this.patients.create(newPatient).id
      : dto.patientId;
    const updated = super.update(id, {
      ...dto,
      ...(patientId && {
        patientId,
        patientName: this.resolvePatientName(patientId, dto.patientName),
      }),
      ...(dto.startsAt && { startsAt: new Date(dto.startsAt).toISOString() }),
      // Moving a booked visit to another date/time marks it Rescheduled.
      ...(moving && {
        status: 'Rescheduled' as const,
        rescheduledAt: new Date().toISOString(),
      }),
    });
    // Package due dates are worked out from the visits, so moving one needs no bookkeeping.
    return updated;
  }

  /** Patient has arrived. Allowed on (or after) the appointment's day. */
  checkIn(id: string): Appointment {
    const a = this.findOne(id);
    if (!isOpen(a)) {
      throw new BadRequestException(
        `This appointment is already ${a.status.toLowerCase()}`,
      );
    }
    if (clinicDate(a.startsAt) > clinicDate()) {
      throw new BadRequestException(
        'A patient can’t be checked in before the day of the appointment',
      );
    }
    const updated = super.update(id, {
      status: 'Checked in',
      checkedInAt: new Date().toISOString(),
    });
    if (a.patientId)
      this.patients.update(a.patientId, { lastVisit: clinicDate() });
    return updated;
  }

  /** Undo a check-in made by mistake: back to Scheduled (or Rescheduled). */
  undoCheckIn(id: string): Appointment {
    const a = this.findOne(id);
    if (a.status !== 'Checked in')
      throw new BadRequestException('This appointment isn’t checked in');
    return super.update(id, {
      status: a.rescheduledAt ? 'Rescheduled' : 'Scheduled',
      checkedInAt: null,
    });
  }

  /** Visit done. Only after the patient has been checked in. */
  complete(id: string): Appointment {
    const a = this.findOne(id);
    if (a.status !== 'Checked in') {
      throw new BadRequestException(
        a.status === 'Completed'
          ? 'This appointment is already completed'
          : 'Check the patient in first',
      );
    }
    const done = super.update(id, {
      status: 'Completed',
      completedAt: new Date().toISOString(),
    });
    // Lets PackagesService close packages whose every step is done.
    this.events.emit(APPOINTMENT_COMPLETED, done);
    return this.findOne(id);
  }

  /** Undo "Mark completed" (e.g. clicked too early): back to Checked in. */
  reopen(id: string): Appointment {
    const a = this.findOne(id);
    if (a.status !== 'Completed')
      throw new BadRequestException('This appointment isn’t completed');
    // Completion is only allowed from Checked in, so that is always the previous status.
    const reopened = super.update(id, {
      status: 'Checked in',
      completedAt: null,
    });
    // Lets PackagesService reopen a package this visit had completed.
    this.events.emit(APPOINTMENT_REOPENED, reopened);
    return this.findOne(id);
  }

  /** Mirrors the visit's bill status (Pending → Partially paid → Paid) onto the visit. */
  @OnEvent(INVOICE_CHANGED)
  onInvoiceChanged(invoice: Invoice) {
    if (invoice.appointmentId)
      this.setBillStatus(invoice.appointmentId, invoice.status);
  }

  /** null: the visit has no bill (e.g. an unpaid bill dropped when completion was undone). */
  setBillStatus(id: string, billStatus: Invoice['status'] | null) {
    const a = this.repo.findOne(id);
    if (a && (a.billStatus ?? null) !== billStatus)
      super.update(id, { billStatus });
  }

  /** A package session's name follows its step, e.g. after the graft count is updated. */
  renameForPackage(id: string, type: string): Appointment {
    return super.update(id, { type });
  }

  /** Books a session from a treatment package (see PackagesService). */
  createForPackage(
    data: NewEntity<Appointment> & { packageId: string },
  ): Appointment {
    this.assertTheatreFree(data);
    return this.insert(data);
  }

  /**
   * One surgery at a time: a surgery can't overlap another surgery's days.
   * Regular OPD (consultations, PRP) is never blocked by this.
   */
  assertTheatreFree(
    candidate: { startsAt: string; days?: number | undefined },
    excludeId?: string,
  ) {
    if (candidate.days === undefined) return;
    const span = spanOf({
      startsAt: new Date(candidate.startsAt).toISOString(),
      days: candidate.days,
    });
    const clash = this.findAll().find(
      (a) =>
        a.id !== excludeId &&
        isSurgery(a) &&
        a.status !== 'Missed' &&
        spanOf(a).first <= span.last &&
        span.first <= spanOf(a).last,
    );
    if (clash) {
      const on =
        spanOf(clash).first > span.first ? spanOf(clash).first : span.first;
      throw new ConflictException(
        `Another surgery is already scheduled on ${on} (${clash.patientName}). Consultations and PRP can still be booked that day.`,
      );
    }
  }

  /** Removes a package's sessions that haven't happened yet (used when the package is cancelled). */
  removeUpcomingForPackage(packageId: string) {
    this.findAll()
      .filter((a) => a.packageId === packageId && isOpen(a))
      .forEach((a) => super.remove(a.id));
  }

  /** Package sessions are managed through their package, not deleted one by one. */
  override remove(id: string): void {
    const appointment = this.findOne(id);
    if (appointment.packageId) {
      throw new BadRequestException(
        `This session belongs to package ${appointment.packageId}; reschedule it, or cancel the package`,
      );
    }
    super.remove(id);
  }

  private resolvePatientName(patientId?: string, patientName?: string): string {
    if (patientId) return this.patients.findOne(patientId).name;
    if (!patientName)
      throw new BadRequestException('patientId or patientName is required');
    return patientName;
  }
}

/** Not attended yet and still editable: Scheduled, Rescheduled or Missed. */
export function isOpen(a: Pick<Appointment, 'status'>): boolean {
  return isUpcoming(a) || a.status === 'Missed';
}

/** Booked and not yet attended: Scheduled or Rescheduled. */
export function isUpcoming(a: Pick<Appointment, 'status'>): boolean {
  return a.status === 'Scheduled' || a.status === 'Rescheduled';
}

/** Surgery is the only multi-day kind of appointment, so `days` marks it. */
export function isSurgery(a: Pick<Appointment, 'days'>): boolean {
  return a.days !== undefined;
}

/** First and last clinic-local day an appointment occupies. */
export function spanOf(a: Pick<Appointment, 'startsAt' | 'days'>): {
  first: string;
  last: string;
} {
  const first = clinicDate(a.startsAt);
  return { first, last: addDays(first, (a.days ?? 1) - 1) };
}
