import { Injectable } from '@nestjs/common';
import { Appointment } from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { addMonths, clinicDate, clinicMonth } from '../common/dates';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsService } from '../invoices/payments.service';
import { LeadsService } from '../leads/leads.service';
import { PackagesService } from '../packages/packages.service';
import { PatientsService } from '../patients/patients.service';

type TreatmentKind = 'prp' | 'transplant' | 'consultation' | 'other';

/** Groups an appointment by what was done, from its type (and `days` for surgery). */
function kindOf(a: Appointment): TreatmentKind {
  const type = a.type.toLowerCase();
  if (a.days !== undefined || /transplant|fue/.test(type)) return 'transplant';
  if (type.includes('prp')) return 'prp';
  if (/consult|analysis|review|follow/.test(type)) return 'consultation';
  return 'other';
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly patients: PatientsService,
    private readonly appointments: AppointmentsService,
    private readonly leads: LeadsService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly packages: PackagesService,
  ) {}

  /** Dashboard figures for the current clinic day and month — all from live records. */
  summary() {
    const today = clinicDate();
    const month = clinicMonth();
    const lastMonth = addMonths(`${month}-01`, -1).slice(0, 7);

    const patients = this.patients.findAll();
    const todays = this.appointments.list({ date: today });
    const monthVisits = this.appointments
      .list({ month })
      // Count a multi-day surgery once, in the month it starts.
      .filter((a) => clinicMonth(a.startsAt) === month);
    const prp = monthVisits.filter((a) => kindOf(a) === 'prp');

    const payments = this.payments.findAll();
    const receivedIn = (period: string) =>
      payments
        .filter((p) => clinicDate(p.receivedAt).startsWith(period))
        .reduce((total, p) => total + p.amount, 0);
    const invoices = this.invoices
      .findAll()
      .filter((i) => i.status !== 'Cancelled');

    // Completed visits whose bill is still open (see BillingService.onAppointmentCompleted).
    const completedIds = new Set(
      this.appointments
        .findAll()
        .filter((a) => a.status === 'Completed')
        .map((a) => a.id),
    );
    const unpaidVisits = invoices.filter(
      (i) =>
        i.appointmentId &&
        completedIds.has(i.appointmentId) &&
        i.amount > i.paid,
    );

    // This month's completed per-graft surgeries. Grafts come only from the count
    // entered after the surgery (`actualGrafts`), never the package's estimate.
    const appointmentsById = new Map(
      this.appointments.findAll().map((a) => [a.id, a]),
    );
    const surgeries = this.packages
      .findAll()
      .flatMap((pkg) => pkg.steps)
      .filter((s) => s.unit === 'graft' && s.appointmentId)
      .map((s) => ({
        grafts: s.actualGrafts,
        visit: appointmentsById.get(s.appointmentId!),
      }))
      .filter(
        ({ visit }) =>
          visit?.status === 'Completed' &&
          clinicMonth(visit.startsAt) === month,
      );
    const counted = surgeries.filter((s) => s.grafts);
    const monthGrafts = counted.reduce((total, s) => total + s.grafts!, 0);

    const mix: Record<TreatmentKind, number> = {
      prp: 0,
      transplant: 0,
      consultation: 0,
      other: 0,
    };
    for (const a of monthVisits) mix[kindOf(a)]++;

    return {
      today,
      month,
      patients: {
        total: patients.length,
        newThisMonth: patients.filter((p) => clinicMonth(p.createdAt) === month)
          .length,
      },
      appointmentsToday: {
        total: todays.length,
        scheduled: todays.filter(
          (a) => a.status === 'Scheduled' || a.status === 'Rescheduled',
        ).length,
        checkedIn: todays.filter((a) => a.status === 'Checked in').length,
        completed: todays.filter((a) => a.status === 'Completed').length,
      },
      revenue: {
        thisMonth: receivedIn(month),
        lastMonth: receivedIn(lastMonth),
        today: receivedIn(today),
        billedThisMonth: invoices
          .filter((i) => i.issuedAt.startsWith(month))
          .reduce((total, i) => total + i.amount, 0),
        outstanding: invoices.reduce(
          (total, i) => total + Math.max(0, i.amount - i.paid),
          0,
        ),
        /** Completed visits not yet paid in full, and what's still owed on them. */
        unpaidVisits: {
          count: unpaidVisits.length,
          amount: unpaidVisits.reduce(
            (total, i) => total + i.amount - i.paid,
            0,
          ),
        },
      },
      prpSessions: {
        thisMonth: prp.length,
        completed: prp.filter((a) => a.status === 'Completed').length,
      },
      grafts: {
        /** Completed surgeries this month (by the day the surgery started). */
        surgeries: surgeries.length,
        /** Of those, how many still need their graft count entered. */
        awaitingCount: surgeries.length - counted.length,
        /** Grafts entered after surgery, this month. */
        total: monthGrafts,
        /** Per surgery with a graft count (0 when none). */
        average: counted.length ? Math.round(monthGrafts / counted.length) : 0,
      },
      treatmentMix: { total: monthVisits.length, ...mix },
      openLeads: this.leads
        .findAll()
        .filter((l) => l.stage !== 'Converted' && l.stage !== 'Lost').length,
    };
  }
}
