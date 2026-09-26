import { Injectable } from '@nestjs/common';
import { AppointmentsService } from '../appointments/appointments.service';
import { clinicDate, clinicMonth } from '../common/dates';
import { InvoicesService } from '../invoices/invoices.service';
import { LeadsService } from '../leads/leads.service';
import { PatientsService } from '../patients/patients.service';
import { TreatmentsService } from '../treatments/treatments.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly patients: PatientsService,
    private readonly appointments: AppointmentsService,
    private readonly leads: LeadsService,
    private readonly treatments: TreatmentsService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Headline metrics for the Dashboard view, computed for the current clinic day/month. */
  summary() {
    const today = this.appointments.list({ date: clinicDate() });
    const month = clinicMonth();
    const invoices = this.invoices.findAll();
    const treatments = this.treatments.findAll();
    const monthTreatments = treatments.filter((t) =>
      t.lastSessionAt.startsWith(month),
    );

    return {
      totalPatients: this.patients.findAll().length,
      appointmentsToday: today.length,
      pendingAppointmentsToday: today.filter((a) => a.status === 'Scheduled')
        .length,
      revenueThisMonth: sum(
        invoices.filter(
          (i) => i.status === 'Paid' && i.issuedAt.startsWith(month),
        ),
      ),
      outstanding: sum(
        invoices.filter(
          (i) => i.status === 'Pending' || i.status === 'Overdue',
        ),
      ),
      activePrpPlans: treatments.filter(
        (t) => t.type === 'PRP' && t.status === 'Active',
      ).length,
      reviewsDue: treatments.filter((t) => t.status === 'Review due').length,
      openLeads: this.leads
        .findAll()
        .filter((l) => l.stage !== 'Converted' && l.stage !== 'Lost').length,
      treatmentMix: {
        PRP: monthTreatments.filter((t) => t.type === 'PRP').length,
        Transplant: monthTreatments.filter((t) => t.type === 'Transplant')
          .length,
        Consultation: monthTreatments.filter((t) => t.type === 'Consultation')
          .length,
      },
    };
  }
}

function sum(invoices: { amount: number }[]) {
  return invoices.reduce((total, i) => total + i.amount, 0);
}
