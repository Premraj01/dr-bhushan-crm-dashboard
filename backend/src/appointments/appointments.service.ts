import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { NewEntity } from '../common/entity';
import { clinicDate, clinicMonth } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import { seedAppointments } from '../seed/seed-data';
import { APPOINTMENT_RESCHEDULED, Appointment } from './appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQuery } from './dto/list-appointments.query';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService extends CrudService<Appointment> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    super(events, 'appointment', 'APT-', seedAppointments);
  }

  list({
    date,
    month,
    patientId,
    doctor,
    status,
  }: ListAppointmentsQuery): Appointment[] {
    return this.findAll()
      .filter((a) => !date || clinicDate(a.startsAt) === date)
      .filter((a) => !month || clinicMonth(a.startsAt) === month)
      .filter((a) => !patientId || a.patientId === patientId)
      .filter((a) => !doctor || a.doctor === doctor)
      .filter((a) => !status || a.status === status)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
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
    return this.insert({
      ...dto,
      ...(patientId && { patientId }),
      patientName: this.resolvePatientName(patientId, dto.patientName),
      startsAt: new Date(dto.startsAt).toISOString(),
      durationMinutes: dto.durationMinutes ?? 30,
      status: dto.status ?? 'Scheduled',
    });
  }

  override update(
    id: string,
    { newPatient, ...dto }: UpdateAppointmentDto,
  ): Appointment {
    const current = this.findOne(id);
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
    });
    if (
      updated.packageId &&
      clinicDate(updated.startsAt) !== clinicDate(current.startsAt)
    ) {
      // Lets PackagesService move the matching session in the package schedule.
      this.events.emit(APPOINTMENT_RESCHEDULED, updated);
    }
    return updated;
  }

  /** Books a session from a treatment package (see PackagesService). */
  createForPackage(
    data: NewEntity<Appointment> & { packageId: string },
  ): Appointment {
    return this.insert(data);
  }

  /** Removes a package's sessions that haven't happened yet (used when the package is cancelled). */
  removeUpcomingForPackage(packageId: string) {
    this.findAll()
      .filter((a) => a.packageId === packageId && a.status === 'Scheduled')
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
