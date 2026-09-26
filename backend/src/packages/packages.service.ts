import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_RESCHEDULED,
  type Appointment,
} from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuthUser } from '../auth/auth-user';
import { TreatmentOption } from '../catalog/catalog.entity';
import { TreatmentCatalogService } from '../catalog/catalog.service';
import { CrudService } from '../common/crud.service';
import { addMonths, clinicDate, clinicDateTimeToIso } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import { CreatePackageDto } from './dto/create-package.dto';
import {
  PackageLine,
  PackageStatus,
  PackageStep,
  StepKind,
  TreatmentPackage,
} from './package.entity';

const grafts = new Intl.NumberFormat('en-IN');

@Injectable()
export class PackagesService extends CrudService<TreatmentPackage> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
    private readonly catalog: TreatmentCatalogService,
    private readonly appointments: AppointmentsService,
  ) {
    super(events, 'package', 'PKG-', []);
  }

  forPatient(patientId: string): TreatmentPackage[] {
    this.patients.findOne(patientId);
    return this.findAll()
      .filter((p) => p.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Prices a package from Settings → Treatments:
   *  - PRP: sessions × the PRP session price
   *  - FUE: grafts × price per graft (overridable per package), plus the
   *    transplant's complimentary PRP sessions at ₹0
   */
  quote(
    dto: CreatePackageDto,
  ): Pick<
    TreatmentPackage,
    | 'lines'
    | 'prpSessions'
    | 'grafts'
    | 'total'
    | 'startDate'
    | 'intervalMonths'
    | 'schedule'
  > {
    const lines: PackageLine[] = [];
    const prp = this.catalog.prpSession();
    const paidPrp = dto.prpSessions ?? 0;
    let freePrp = 0;

    if (paidPrp > 0) {
      if (!prp)
        throw new BadRequestException(
          'Add an active per-session PRP treatment in Settings first',
        );
      lines.push({
        treatmentOptionId: prp.id,
        description: prp.name,
        unit: 'session',
        quantity: paidPrp,
        unitPrice: prp.price,
        amount: paidPrp * prp.price,
        complimentary: false,
      });
    }

    if (dto.transplant) {
      const fue = this.catalog.graftTransplant();
      if (!fue)
        throw new BadRequestException(
          'Add an active per-graft transplant treatment in Settings first',
        );
      const unitPrice = dto.transplant.pricePerGraft ?? fue.price;
      lines.push({
        treatmentOptionId: fue.id,
        description: `${fue.name} · ${grafts.format(dto.transplant.grafts)} grafts`,
        unit: 'graft',
        quantity: dto.transplant.grafts,
        unitPrice,
        amount: dto.transplant.grafts * unitPrice,
        complimentary: false,
      });
      freePrp = fue.complimentaryPrpSessions ?? 0;
      if (freePrp > 0 && prp) {
        lines.push({
          treatmentOptionId: prp.id,
          description: `${prp.name} · complimentary with transplant`,
          unit: 'session',
          quantity: freePrp,
          unitPrice: prp.price,
          amount: 0,
          complimentary: true,
        });
      }
    }

    if (lines.length === 0) {
      throw new BadRequestException(
        'A package needs PRP sessions, a hair transplant, or both',
      );
    }
    const startDate = dto.startDate ?? clinicDate();
    const intervalMonths = dto.intervalMonths ?? 3;
    const transplantLine = lines.find((l) => l.unit === 'graft');
    return {
      lines,
      prpSessions: paidPrp + freePrp,
      ...(dto.transplant && { grafts: dto.transplant.grafts }),
      total: lines.reduce((sum, l) => sum + l.amount, 0),
      startDate,
      intervalMonths,
      schedule: buildSchedule({
        sequence: dto.sequence,
        paidPrp,
        freePrp: prp ? freePrp : 0,
        prpName: prp?.name ?? 'PRP session',
        transplant: transplantLine?.description,
        startDate,
        intervalMonths,
      }),
    };
  }

  /** Saves the package and books every session in the appointment calendar. */
  create(
    patientId: string,
    dto: CreatePackageDto,
    user: AuthUser,
  ): TreatmentPackage {
    const patient = this.patients.findOne(patientId);
    const quote = this.quote(dto);
    const sessionTime = dto.sessionTime ?? '10:00';
    const doctor = dto.doctor ?? user.name;
    const pkg = this.insert({
      ...quote,
      sessionTime,
      doctor,
      patientId,
      patientName: patient.name,
      status: 'Proposed',
      ...(dto.notes && { notes: dto.notes }),
      createdBy: { id: user.id, name: user.name, role: user.role },
    });

    const prp = this.catalog.prpSession();
    const fue = this.catalog.graftTransplant();
    const schedule = pkg.schedule.map((step) => {
      const appointment = this.appointments.createForPackage({
        patientId,
        patientName: patient.name,
        type: step.description,
        doctor,
        startsAt: clinicDateTimeToIso(step.date, sessionTime),
        durationMinutes: slotMinutes(step.kind === 'transplant' ? fue : prp),
        status: 'Scheduled',
        notes: `Package ${pkg.id}`,
        packageId: pkg.id,
      });
      return { ...step, appointmentId: appointment.id };
    });
    const saved = this.update(pkg.id, { schedule });
    this.patients.update(patientId, { treatment: summarize(saved) });
    return saved;
  }

  /** Rescheduling a session in the calendar moves it in the package schedule too. */
  @OnEvent(APPOINTMENT_RESCHEDULED)
  onAppointmentRescheduled(appointment: Appointment) {
    const pkg = this.findAll().find((p) => p.id === appointment.packageId);
    if (!pkg) return;
    const date = clinicDate(appointment.startsAt);
    const schedule = pkg.schedule.map((step) =>
      step.appointmentId === appointment.id ? { ...step, date } : step,
    );
    this.update(pkg.id, { schedule });
  }

  /** Cancelling a package removes its upcoming sessions from the calendar. */
  setStatus(id: string, status: PackageStatus): TreatmentPackage {
    const pkg = this.update(id, { status });
    if (status === 'Cancelled') this.appointments.removeUpcomingForPackage(id);
    return pkg;
  }
}

/** Short plan label for the patient list, e.g. "Package · FUE 2,500 grafts + 6 PRP". */
function summarize(pkg: TreatmentPackage): string {
  const parts = [
    pkg.grafts ? `FUE ${grafts.format(pkg.grafts)} grafts` : null,
    pkg.prpSessions ? `${pkg.prpSessions} PRP` : null,
  ].filter(Boolean);
  return `Package · ${parts.join(' + ')}`;
}

/**
 * Lays sessions out `intervalMonths` apart from the start date, in the given order
 * (default: transplant, then its complimentary PRP, then paid PRP).
 */
function buildSchedule(opts: {
  sequence: StepKind[] | undefined;
  paidPrp: number;
  freePrp: number;
  prpName: string;
  transplant: string | undefined;
  startDate: string;
  intervalMonths: number;
}): PackageStep[] {
  const counts: Record<StepKind, number> = {
    transplant: opts.transplant ? 1 : 0,
    'prp-free': opts.freePrp,
    prp: opts.paidPrp,
  };
  const defaultOrder = (Object.keys(counts) as StepKind[]).flatMap((kind) =>
    Array<StepKind>(counts[kind]).fill(kind),
  );
  const order = opts.sequence ?? defaultOrder;
  const given = order.reduce<Record<string, number>>(
    (acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }),
    {},
  );
  if (
    (Object.keys(counts) as StepKind[]).some(
      (k) => (given[k] ?? 0) !== counts[k],
    )
  ) {
    throw new BadRequestException(
      `sequence must list each session exactly once: ${counts.transplant} transplant, ${counts.prp} PRP, ${counts['prp-free']} complimentary PRP`,
    );
  }

  const seen: Record<StepKind, number> = {
    prp: 0,
    transplant: 0,
    'prp-free': 0,
  };
  return order.map((kind, i) => {
    const n = ++seen[kind];
    const description =
      kind === 'transplant'
        ? opts.transplant!
        : kind === 'prp'
          ? `${opts.prpName} ${n} of ${counts.prp}`
          : `${opts.prpName} ${n} of ${counts['prp-free']} · complimentary`;
    return {
      kind,
      description,
      date: addMonths(opts.startDate, i * opts.intervalMonths),
      complimentary: kind === 'prp-free',
    };
  });
}

/** Calendar slot for a session: the treatment's duration, capped at a full clinic day. */
function slotMinutes(option: TreatmentOption | undefined): number {
  if (!option) return 45;
  const upper = option.durationMax ?? option.duration;
  const minutes =
    option.durationUnit === 'days'
      ? 480
      : option.durationUnit === 'hours'
        ? upper * 60
        : upper;
  return Math.min(480, minutes);
}
