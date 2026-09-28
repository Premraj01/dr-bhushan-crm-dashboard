import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_BOOKED,
  APPOINTMENT_COMPLETED,
  APPOINTMENT_REOPENED,
  type Appointment,
  type AppointmentStatus,
} from '../appointments/appointment.entity';
import {
  AppointmentsService,
  spanOf,
} from '../appointments/appointments.service';
import { AuthUser } from '../auth/auth-user';
import { TreatmentOption } from '../catalog/catalog.entity';
import { TreatmentCatalogService } from '../catalog/catalog.service';
import { CrudService } from '../common/crud.service';
import { InvoicesService } from '../invoices/invoices.service';
import { addDays, clinicDate } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import { PlansService } from '../plans/plans.service';
import { addGap, expandPlan, normalizeItems } from '../plans/plan-steps';
import { BookSessionDto } from './dto/book-session.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import {
  PackageLine,
  PackageStatus,
  PackageStep,
  TreatmentPackage,
} from './package.entity';

const count = new Intl.NumberFormat('en-IN');

/** A package whose surgery still needs a slot — shown under "Pending bookings". */
export interface PendingBooking {
  packageId: string;
  patientId: string;
  patientName: string;
  status: PackageStatus;
  /** When the package was created (how long it has been waiting). */
  createdAt: string;
  createdBy: string;
  /** Step index of the surgery. */
  stepIndex: number;
  /** e.g. "FUE hair transplant · 2,500 grafts". */
  surgery: string;
  /** The surgery was booked but the patient didn't come — it needs a new slot. */
  missed: boolean;
}

/**
 * done: visit completed · in-clinic: checked in now · booked: has a slot ·
 * missed: its visit was missed · to-book: no visit yet.
 */
export type StepState = 'done' | 'in-clinic' | 'booked' | 'missed' | 'to-book';

export interface StepView extends PackageStep {
  index: number;
  state: StepState;
  /** First day of the booked (or completed) visit. */
  date?: string;
  appointmentStatus?: AppointmentStatus;
  /** Previous visit's procedure day + gap; the package start date for the first step. */
  dueDate: string;
  windowStart: string;
  windowEnd: string;
  /** The previous visit hasn't happened yet, so this date will move with it. */
  estimated: boolean;
}

/** A package as the API returns it: its steps with live state and due dates. */
export type PackageView = Omit<TreatmentPackage, 'steps'> & {
  steps: StepView[];
  progress: { done: number; total: number };
  /** First step still needing a slot (never booked, or missed); null when none. */
  next: number | null;
};

/** A plan step that has come due — the front desk's reminder list. */
export interface DueReminder {
  packageId: string;
  packageName: string;
  patientId: string;
  patientName: string;
  phone?: string;
  stepIndex: number;
  treatment: string;
  cycle?: { n: number; of: number };
  dueDate: string;
  windowStart: string;
  windowEnd: string;
  /** Days past the end of the window (0 when not overdue). */
  overdueDays: number;
  missed: boolean;
}

@Injectable()
export class PackagesService extends CrudService<TreatmentPackage> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
    private readonly catalog: TreatmentCatalogService,
    private readonly appointments: AppointmentsService,
    private readonly plans: PlansService,
    private readonly invoices: InvoicesService,
  ) {
    super(events, 'package', 'PKG-', []);
  }

  forPatient(patientId: string): PackageView[] {
    this.patients.findOne(patientId);
    return this.findAll()
      .filter((p) => p.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => this.view(p));
  }

  /** Surgeries waiting for a slot: never booked, or booked and missed. */
  pendingQueue(): PendingBooking[] {
    return this.findAll()
      .filter((p) => p.status === 'Accepted')
      .map((pkg): PendingBooking | null => {
        const step = this.view(pkg).steps.find(
          (s) => s.surgery && (s.state === 'to-book' || s.state === 'missed'),
        );
        if (!step) return null;
        return {
          packageId: pkg.id,
          patientId: pkg.patientId,
          patientName: pkg.patientName,
          status: pkg.status,
          createdAt: pkg.createdAt,
          createdBy: pkg.createdBy.name,
          stepIndex: step.index,
          surgery: step.description,
          missed: step.state === 'missed',
        };
      })
      .filter((p): p is PendingBooking => p !== null)
      .sort(
        (a, b) =>
          Number(b.missed) - Number(a.missed) ||
          a.createdAt.localeCompare(b.createdAt),
      );
  }

  /**
   * Reminders: for each active package, the next visit to book once the one before it
   * is done — shown from `withinDays` before its due date. Surgery is in pendingQueue.
   */
  dueReminders(withinDays = 7): DueReminder[] {
    const today = clinicDate();
    const horizon = addDays(today, withinDays);
    const out: DueReminder[] = [];
    for (const pkg of this.findAll().filter((p) => p.status === 'Accepted')) {
      const { steps } = this.view(pkg);
      const step = steps.find(
        (s) => s.state === 'to-book' || s.state === 'missed',
      );
      if (!step || step.surgery) continue;
      const before = steps[step.index - 1];
      if (before && before.state !== 'done' && before.state !== 'in-clinic')
        continue;
      if (step.windowStart > horizon) continue;
      const patient = this.patients
        .findAll()
        .find((p) => p.id === pkg.patientId);
      out.push({
        packageId: pkg.id,
        packageName: pkg.name,
        patientId: pkg.patientId,
        patientName: pkg.patientName,
        ...(patient?.phone && { phone: patient.phone }),
        stepIndex: step.index,
        treatment: step.description,
        ...(step.cycle && { cycle: step.cycle }),
        dueDate: step.dueDate,
        windowStart: step.windowStart,
        windowEnd: step.windowEnd,
        overdueDays: Math.max(0, daysBetween(step.windowEnd, today)),
        missed: step.state === 'missed',
      });
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  /**
   * Prices a plan for a patient and projects its dates from `startDate`. Each step is
   * priced from Settings unless the doctor set a price (0 waives it) or marked it free.
   */
  quote(
    dto: CreatePackageDto,
    { strict = false } = {},
  ): Pick<
    PackageView,
    'name' | 'startDate' | 'items' | 'steps' | 'lines' | 'total'
  > {
    const plan = dto.planId ? this.plans.findOne(dto.planId) : undefined;
    const items = normalizeItems(dto.items, (id) => this.treatment(id));
    const steps = expandPlan(items).map((s): PackageStep => {
      const t = this.treatment(s.treatmentId)!;
      const graft = t.pricingUnit === 'graft';
      if (strict && graft && !s.quantity) {
        throw new BadRequestException(
          `Enter the number of grafts for ${t.name}`,
        );
      }
      const quantity = s.quantity ?? (graft ? 0 : 1);
      const unitPrice = s.unitPrice ?? t.price;
      const complimentary = s.complimentary ?? false;
      return {
        treatmentId: t.id,
        description: graft
          ? `${t.name} · ${quantity ? `${count.format(quantity)} grafts` : 'grafts to be set'}`
          : t.name,
        unit: t.pricingUnit,
        quantity,
        unitPrice,
        amount: complimentary ? 0 : quantity * unitPrice,
        complimentary,
        surgery: t.surgical === true,
        gap: s.gap,
        windowDays: s.windowDays ?? 0,
        ...(s.cycle && { cycle: s.cycle }),
        ...(s.note && { note: s.note }),
      };
    });
    const lines = summarizeLines(steps);
    const startDate = dto.startDate ?? clinicDate();
    return {
      name: dto.name?.trim() || plan?.name || 'Custom plan',
      startDate,
      items,
      steps: this.schedule(steps, startDate),
      lines,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
    };
  }

  /** Saves the package (accepted straight away). Visits are booked later from the calendar. */
  create(
    patientId: string,
    dto: CreatePackageDto,
    user: AuthUser,
  ): PackageView {
    const patient = this.patients.findOne(patientId);
    const quote = this.quote(dto, { strict: true });
    const pkg = this.insert({
      patientId,
      patientName: patient.name,
      name: quote.name,
      ...(dto.planId && { planId: dto.planId }),
      startDate: quote.startDate,
      items: quote.items,
      steps: quote.steps.map((s) => stored(s)),
      lines: quote.lines,
      total: quote.total,
      status: 'Accepted',
      ...(dto.notes && { notes: dto.notes }),
      createdBy: { id: user.id, name: user.name, role: user.role },
    });
    this.patients.update(patientId, { treatment: `Package · ${pkg.name}` });
    return this.view(pkg);
  }

  /** Books step `index` into the calendar (or re-books it after a missed visit). */
  bookSession(id: string, index: number, dto: BookSessionDto): PackageView {
    const pkg = this.findOne(id);
    if (pkg.status !== 'Accepted')
      throw new BadRequestException(
        `This package is ${pkg.status.toLowerCase()}`,
      );
    const step = pkg.steps[index];
    if (!step) throw new BadRequestException(`${pkg.id} has no step ${index}`);
    const option = this.treatment(step.treatmentId);
    const days = step.surgery ? (dto.days ?? option?.duration ?? 1) : undefined;
    const existing = step.appointmentId
      ? this.appointmentOf(step.appointmentId)
      : undefined;
    if (existing && existing.status !== 'Missed') {
      throw new ConflictException(
        `${step.description} is already booked; reschedule it from the calendar instead`,
      );
    }

    let appointment: Appointment;
    if (existing) {
      // Missed visit: move the same appointment to the new slot (it becomes Rescheduled).
      appointment = this.appointments.update(existing.id, {
        startsAt: dto.startsAt,
        doctor: dto.doctor,
        ...(days !== undefined && { days }),
        ...(dto.notes && { notes: dto.notes }),
      });
    } else {
      appointment = this.appointments.createForPackage({
        patientId: pkg.patientId,
        patientName: pkg.patientName,
        type: step.description,
        doctor: dto.doctor,
        startsAt: new Date(dto.startsAt).toISOString(),
        durationMinutes: slotMinutes(option),
        ...(days !== undefined && { days }),
        status: 'Scheduled',
        notes: dto.notes ?? `Package ${pkg.id}`,
        packageId: pkg.id,
        packageStep: index,
      });
    }
    return this.view(this.setAppointment(pkg, index, appointment.id));
  }

  /**
   * A visit booked for a treatment in the patient's plan takes the first step of that
   * treatment still needing a slot (oldest package first). A missed visit gives its
   * step up to the new booking.
   */
  @OnEvent(APPOINTMENT_BOOKED)
  onAppointmentBooked(appointment: Appointment) {
    if (!appointment.patientId || appointment.packageId) return;
    const type = appointment.type.trim().toLowerCase();
    for (const pkg of this.activeFor(appointment.patientId)) {
      const step = this.view(pkg).steps.find(
        (s) =>
          (s.state === 'to-book' || s.state === 'missed') &&
          (this.treatment(s.treatmentId)?.name.toLowerCase() === type ||
            s.description.toLowerCase() === type),
      );
      if (!step) continue;
      if (step.appointmentId)
        this.appointments.linkToPackage(step.appointmentId, null, null);
      this.appointments.linkToPackage(appointment.id, pkg.id, step.index);
      this.setAppointment(pkg, step.index, appointment.id);
      return;
    }
  }

  /** A package whose every step is done becomes Completed. */
  @OnEvent(APPOINTMENT_COMPLETED)
  onAppointmentCompleted(appointment: Appointment) {
    const pkg = appointment.packageId
      ? this.findAll().find((p) => p.id === appointment.packageId)
      : undefined;
    if (!pkg || pkg.status !== 'Accepted') return;
    if (this.view(pkg).steps.every((s) => s.state === 'done'))
      this.update(pkg.id, { status: 'Completed' });
  }

  /** Undoing a visit's completion reopens the package it had completed. */
  @OnEvent(APPOINTMENT_REOPENED)
  onAppointmentReopened(appointment: Appointment) {
    const pkg = appointment.packageId
      ? this.findAll().find((p) => p.id === appointment.packageId)
      : undefined;
    if (pkg?.status === 'Completed')
      this.update(pkg.id, { status: 'Accepted' });
  }

  /**
   * The graft count agreed in the package is an estimate; the real number is known once
   * the surgery is under way or done. Reprices the step, the package total and the
   * surgery's bill, and renames the visit to match.
   */
  setGrafts(id: string, index: number, grafts: number): PackageView {
    const pkg = this.findOne(id);
    if (pkg.status === 'Cancelled')
      throw new BadRequestException('This package is cancelled');
    const step = pkg.steps[index];
    if (!step) throw new BadRequestException(`${pkg.id} has no step ${index}`);
    if (step.unit !== 'graft')
      throw new BadRequestException(
        `${step.description} isn’t priced per graft`,
      );
    const visit = step.appointmentId
      ? this.appointmentOf(step.appointmentId)
      : undefined;
    if (
      !visit ||
      (visit.status !== 'Checked in' && visit.status !== 'Completed')
    ) {
      throw new BadRequestException(
        'The graft count can be updated once the patient is checked in for the surgery',
      );
    }
    const name =
      this.treatment(step.treatmentId)?.name ??
      step.description.split(' · ')[0];
    const description = `${name} · ${count.format(grafts)} grafts`;
    const amount = step.complimentary ? 0 : grafts * step.unitPrice;
    // Reprice the bill first: it refuses when more was paid than the new total.
    const invoice = this.invoices
      .findAll()
      .find((i) => i.appointmentId === visit.id);
    if (invoice)
      this.invoices.reprice(invoice.id, {
        amount,
        service: `${description}${step.complimentary ? ' · complimentary' : ''} · ${pkg.id}`,
      });
    const steps = pkg.steps.map((s, i) =>
      i === index ? { ...s, quantity: grafts, description, amount } : s,
    );
    const lines = summarizeLines(steps);
    const updated = this.update(pkg.id, {
      steps,
      lines,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
    });
    this.appointments.renameForPackage(visit.id, description);
    return this.view(updated);
  }

  /** Cancelling a package removes its visits that haven't happened yet. */
  setStatus(id: string, status: PackageStatus): PackageView {
    const pkg = this.update(id, { status });
    if (status === 'Cancelled') this.appointments.removeUpcomingForPackage(id);
    return this.view(pkg);
  }

  /** Package with each step's state and due date, as the API returns it. */
  view(pkg: TreatmentPackage): PackageView {
    const steps = this.schedule(pkg.steps, pkg.startDate);
    const done = steps.filter((s) => s.state === 'done').length;
    const next = steps.find(
      (s) => s.state === 'to-book' || s.state === 'missed',
    );
    return {
      ...pkg,
      steps,
      progress: { done, total: steps.length },
      next: next?.index ?? null,
    };
  }

  /* ---------- helpers ---------- */

  /**
   * Due dates, in order: the first step is due on the start date; each later step is due
   * `gap` after the previous visit's procedure day (its last day, for multi-day surgery).
   * Until that visit happens, its booked day — or its own due date — stands in, so the
   * rest of the plan moves with it.
   */
  private schedule(steps: PackageStep[], startDate: string): StepView[] {
    const today = clinicDate();
    let anchor = startDate;
    let actual = true;
    return steps.map((step, index) => {
      const dueDate =
        index === 0 || !step.gap ? anchor : addGap(anchor, step.gap);
      const estimated = index > 0 && !actual;
      const visit = step.appointmentId
        ? this.appointmentOf(step.appointmentId)
        : undefined;
      const state: StepState = !visit
        ? 'to-book'
        : visit.status === 'Completed'
          ? 'done'
          : visit.status === 'Checked in'
            ? 'in-clinic'
            : visit.status === 'Missed'
              ? 'missed'
              : 'booked';
      if (visit && state !== 'missed') {
        anchor = spanOf(visit).last;
        actual = state === 'done' || state === 'in-clinic';
      } else {
        // Not booked (or missed): the next step can't come before today.
        anchor = dueDate < today ? today : dueDate;
        actual = false;
      }
      return {
        ...step,
        index,
        state,
        ...(visit && {
          date: clinicDate(visit.startsAt),
          appointmentStatus: visit.status,
        }),
        dueDate,
        windowStart: addDays(dueDate, -step.windowDays),
        windowEnd: addDays(dueDate, step.windowDays),
        estimated,
      };
    });
  }

  private setAppointment(
    pkg: TreatmentPackage,
    index: number,
    appointmentId: string,
  ): TreatmentPackage {
    const steps = pkg.steps.map((s, i) =>
      i === index ? { ...s, appointmentId } : s,
    );
    return this.update(pkg.id, { steps });
  }

  private activeFor(patientId: string): TreatmentPackage[] {
    return this.findAll()
      .filter((p) => p.patientId === patientId && p.status === 'Accepted')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private treatment(id: string): TreatmentOption | undefined {
    return this.catalog.findAll().find((t) => t.id === id);
  }

  private appointmentOf(id: string): Appointment | undefined {
    return this.appointments.findAll().find((a) => a.id === id);
  }
}

/** The stored part of a step (drops the computed view fields). */
function stored(s: StepView): PackageStep {
  const {
    index: _index,
    state: _state,
    date: _date,
    appointmentStatus: _status,
    dueDate: _due,
    windowStart: _ws,
    windowEnd: _we,
    estimated: _est,
    ...step
  } = s;
  return step;
}

/** Groups steps of the same treatment and price into price lines. */
function summarizeLines(steps: PackageStep[]): PackageLine[] {
  const lines = new Map<string, PackageLine>();
  for (const s of steps) {
    const key = `${s.treatmentId}|${s.unitPrice}|${s.complimentary}|${s.unit === 'graft' ? s.quantity : ''}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += s.quantity;
      line.amount += s.amount;
      continue;
    }
    lines.set(key, {
      treatmentOptionId: s.treatmentId,
      description: s.complimentary
        ? `${s.description} · complimentary`
        : s.description,
      unit: s.unit,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      amount: s.amount,
      complimentary: s.complimentary,
    });
  }
  return [...lines.values()];
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Daily slot for a session: the treatment's duration, capped at a full clinic day. */
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
