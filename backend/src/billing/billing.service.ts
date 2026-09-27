import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Appointment } from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuthUser } from '../auth/auth-user';
import { TreatmentCatalogService } from '../catalog/catalog.service';
import { addDays, clinicDate } from '../common/dates';
import { Invoice } from '../invoices/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { Payment } from '../invoices/payment.entity';
import { PaymentsService } from '../invoices/payments.service';
import { PackagesService } from '../packages/packages.service';
import { EmiPlanDto } from './dto/emi-plan.dto';
import { ReceivePaymentDto } from './dto/receive-payment.dto';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** What's owed on a bill (for an appointment or an invoice), and what has been received. */
export interface AppointmentBill {
  /** Set when the bill was opened from an appointment. */
  appointmentId?: string;
  /** Package sessions share the package's bill; other visits are billed on their own. */
  source: 'package' | 'visit';
  packageId?: string;
  invoiceId?: string;
  patientName: string;
  description: string;
  /** YYYY-MM-DD the invoice was issued. */
  issuedAt?: string;
  /** INR. For a visit without a bill yet, the price from Settings (0 if unknown). */
  total: number;
  paid: number;
  balance: number;
  status: Invoice['status'] | 'Not billed';
  /** True when the visit's price isn't known and must be entered with the first payment. */
  needsCharge: boolean;
  /** A package's complimentary session: nothing to pay. */
  complimentary: boolean;
  payments: Payment[];
  /** "emi" when the balance is being paid in installments. */
  plan: 'full' | 'emi';
  installments: InstallmentView[];
}

export interface InstallmentView {
  number: number;
  dueDate: string;
  amount: number;
  /** Received towards this installment (payments are applied in due-date order). */
  paid: number;
  status: 'Paid' | 'Part paid' | 'Due' | 'Overdue' | 'Upcoming';
}

/** Something to collect: a bill's whole balance, or one EMI. */
export interface DueItem {
  invoiceId: string;
  patientId?: string;
  patientName: string;
  description: string;
  /** Bill: the issue date. EMI: the installment's due date. */
  dueDate: string;
  /** INR still to collect for this item. */
  amount: number;
  /** Days past due (0 when not overdue). */
  overdueDays: number;
  kind: 'bill' | 'emi';
  emiNumber?: number;
  emiCount?: number;
}

export interface BillingOverview {
  metrics: {
    receivedToday: number;
    receivedThisMonth: number;
    pendingTotal: number;
    pendingCount: number;
    overdueTotal: number;
    overdueCount: number;
    upcoming30Total: number;
    upcomingCount: number;
  };
  received: (Payment & { description: string })[];
  pending: DueItem[];
  upcoming: DueItem[];
}

@Injectable()
export class BillingService {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly packages: PackagesService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly catalog: TreatmentCatalogService,
  ) {}

  /* ---------- from the calendar (appointment) ---------- */

  bill(appointmentId: string): AppointmentBill {
    const appointment = this.appointments.findOne(appointmentId);
    const invoice = this.existingInvoice(appointment);
    if (invoice) return this.view(invoice, appointment.id);

    // Not billed yet: show what this visit will cost.
    const session = this.packageSession(appointment);
    const total = session ? session.charge : this.visitPrice(appointment);
    return {
      appointmentId: appointment.id,
      source: session ? 'package' : 'visit',
      ...(appointment.packageId && { packageId: appointment.packageId }),
      patientName: appointment.patientName,
      description: session ? session.description : appointment.type,
      total,
      paid: 0,
      balance: total,
      status: 'Not billed',
      needsCharge: !session && total === 0,
      complimentary: !!session?.complimentary,
      payments: [],
      plan: 'full',
      installments: [],
    };
  }

  /** Records a payment against the appointment's bill, opening the bill if needed. */
  receive(
    appointmentId: string,
    dto: ReceivePaymentDto,
    user: AuthUser,
  ): AppointmentBill {
    const appointment = this.appointments.findOne(appointmentId);
    this.pay(this.ensureInvoice(appointment, dto.charge), dto, user);
    return this.bill(appointmentId);
  }

  setEmi(
    appointmentId: string,
    dto: EmiPlanDto,
    user: AuthUser,
  ): AppointmentBill {
    const appointment = this.appointments.findOne(appointmentId);
    this.plan(this.ensureInvoice(appointment, dto.charge), dto, user);
    return this.bill(appointmentId);
  }

  /** Back to a single payment for whatever is due. */
  clearEmi(appointmentId: string): AppointmentBill {
    const appointment = this.appointments.findOne(appointmentId);
    const invoice = this.existingInvoice(appointment);
    if (invoice?.emi) this.invoices.setEmi(invoice.id, null);
    return this.bill(appointmentId);
  }

  /* ---------- from the Billing page (invoice) ---------- */

  invoiceBill(invoiceId: string): AppointmentBill {
    return this.view(this.invoices.findOne(invoiceId));
  }

  receiveForInvoice(
    invoiceId: string,
    dto: ReceivePaymentDto,
    user: AuthUser,
  ): AppointmentBill {
    this.pay(this.invoices.findOne(invoiceId), dto, user);
    return this.invoiceBill(invoiceId);
  }

  setEmiForInvoice(
    invoiceId: string,
    dto: EmiPlanDto,
    user: AuthUser,
  ): AppointmentBill {
    this.plan(this.invoices.findOne(invoiceId), dto, user);
    return this.invoiceBill(invoiceId);
  }

  clearEmiForInvoice(invoiceId: string): AppointmentBill {
    const invoice = this.invoices.findOne(invoiceId);
    if (invoice.emi) this.invoices.setEmi(invoice.id, null);
    return this.invoiceBill(invoiceId);
  }

  /** Billing page: payments received, what's due now, and EMIs still to come. */
  overview(): BillingOverview {
    const today = clinicDate();
    const month = today.slice(0, 7);
    const horizon = addDays(today, 30);
    const invoicesById = new Map(this.invoices.findAll().map((i) => [i.id, i]));

    const received = this.payments
      .findAll()
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((p) => {
        const invoice = invoicesById.get(p.invoiceId);
        return {
          ...p,
          description: invoice ? this.describeInvoice(invoice) : '—',
        };
      });

    const pending: DueItem[] = [];
    const upcoming: DueItem[] = [];
    for (const invoice of invoicesById.values()) {
      const balance = invoice.amount - invoice.paid;
      if (invoice.status === 'Cancelled' || balance <= 0) continue;
      const base = {
        invoiceId: invoice.id,
        ...(invoice.patientId && { patientId: invoice.patientId }),
        patientName: invoice.patientName,
        description: this.describeInvoice(invoice),
      };
      if (!invoice.emi) {
        pending.push({
          ...base,
          dueDate: invoice.issuedAt,
          amount: balance,
          overdueDays:
            invoice.status === 'Overdue'
              ? daysBetween(invoice.issuedAt, today)
              : 0,
          kind: 'bill',
        });
        continue;
      }
      const installments = installmentViews(invoice.emi, invoice.paid);
      for (const inst of installments) {
        if (inst.status === 'Paid') continue;
        const item: DueItem = {
          ...base,
          dueDate: inst.dueDate,
          amount: inst.amount - inst.paid,
          overdueDays: Math.max(0, daysBetween(inst.dueDate, today)),
          kind: 'emi',
          emiNumber: inst.number,
          emiCount: installments.length,
        };
        (inst.dueDate <= today ? pending : upcoming).push(item);
      }
    }
    // Most overdue first; upcoming soonest first.
    pending.sort(
      (a, b) =>
        b.overdueDays - a.overdueDays || a.dueDate.localeCompare(b.dueDate),
    );
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const total = (items: { amount: number }[]) =>
      items.reduce((sum, i) => sum + i.amount, 0);
    const overdue = pending.filter((p) => p.overdueDays > 0);
    const receivedOn = (prefix: string) =>
      total(
        received.filter((p) => clinicDate(p.receivedAt).startsWith(prefix)),
      );
    return {
      metrics: {
        receivedToday: receivedOn(today),
        receivedThisMonth: receivedOn(month),
        pendingTotal: total(pending),
        pendingCount: pending.length,
        overdueTotal: total(overdue),
        overdueCount: overdue.length,
        upcoming30Total: total(upcoming.filter((u) => u.dueDate <= horizon)),
        upcomingCount: upcoming.length,
      },
      received,
      pending,
      upcoming,
    };
  }

  /* ---------- shared ---------- */

  private pay(invoice: Invoice, dto: ReceivePaymentDto, user: AuthUser) {
    if (invoice.status === 'Cancelled')
      throw new BadRequestException('This bill is cancelled');
    const balance = invoice.amount - invoice.paid;
    if (balance <= 0)
      throw new BadRequestException('This bill is already fully paid');
    if (dto.amount > balance) {
      throw new BadRequestException(
        `Amount is more than the balance of ${inr.format(balance)}`,
      );
    }
    this.payments.record({
      invoiceId: invoice.id,
      ...(invoice.patientId && { patientId: invoice.patientId }),
      patientName: invoice.patientName,
      amount: dto.amount,
      method: dto.method,
      ...(dto.reference && { reference: dto.reference }),
      ...(dto.note && { note: dto.note }),
      receivedBy: { id: user.id, name: user.name },
    });
    this.invoices.applyPayment(invoice.id, dto.amount);
  }

  /**
   * Sets up EMIs for the current balance. Replacing a plan re-plans whatever is
   * still due; payments already received stay received.
   */
  private plan(invoice: Invoice, dto: EmiPlanDto, user: AuthUser) {
    if (invoice.status === 'Cancelled')
      throw new BadRequestException('This bill is cancelled');
    const balance = invoice.amount - invoice.paid;
    if (balance <= 0)
      throw new BadRequestException('This bill is already fully paid');
    const sum = dto.installments.reduce((total, i) => total + i.amount, 0);
    if (sum !== balance) {
      throw new BadRequestException(
        `EMIs add up to ${inr.format(sum)} but the balance is ${inr.format(balance)}`,
      );
    }
    const dates = dto.installments.map((i) => i.dueDate);
    if (dates.some((d, i) => i > 0 && d <= dates[i - 1])) {
      throw new BadRequestException(
        'EMI due dates must be in order, one per date',
      );
    }
    if (dates[0] < clinicDate())
      throw new BadRequestException('The first EMI can’t be due in the past');

    this.invoices.setEmi(invoice.id, {
      installments: dto.installments.map(({ dueDate, amount }) => ({
        dueDate,
        amount,
      })),
      paidAtStart: invoice.paid,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    });
  }

  /** The appointment's invoice, opened on first use (package bill, or the visit at its price). */
  private ensureInvoice(appointment: Appointment, charge?: number): Invoice {
    const existing = this.existingInvoice(appointment);
    if (existing) return existing;
    const session = this.packageSession(appointment);
    if (session) {
      if (session.complimentary) {
        throw new BadRequestException(
          'This is a complimentary session — there is nothing to pay',
        );
      }
      return this.invoices.open({
        ...(appointment.patientId && { patientId: appointment.patientId }),
        patientName: appointment.patientName,
        service: session.description,
        amount: session.charge,
        ...(appointment.packageId && { packageId: appointment.packageId }),
        appointmentId: appointment.id,
      });
    }
    const amount = this.visitPrice(appointment) || charge;
    if (!amount) {
      throw new BadRequestException(
        `Enter the charge for "${appointment.type}" with the first payment`,
      );
    }
    return this.invoices.open({
      ...(appointment.patientId && { patientId: appointment.patientId }),
      patientName: appointment.patientName,
      service: appointment.type,
      amount,
      appointmentId: appointment.id,
    });
  }

  /** Every visit — package sessions included — has its own bill. */
  private existingInvoice(appointment: Appointment): Invoice | undefined {
    return this.invoices
      .findAll()
      .find((i) => i.appointmentId === appointment.id);
  }

  /**
   * What a package visit costs on its own: its step's price (quantity × the package's
   * unit price), or ₹0 when the step is complimentary or its cost was waived.
   */
  private packageSession(
    appointment: Appointment,
  ):
    | { charge: number; description: string; complimentary: boolean }
    | undefined {
    const index = appointment.packageStep;
    if (!appointment.packageId || index == null) return undefined;
    const pkg = this.packages
      .findAll()
      .find((p) => p.id === appointment.packageId);
    const step = pkg?.steps[index];
    if (!pkg || !step) return undefined;
    return {
      charge: step.amount,
      description: `${step.description}${step.complimentary ? ' · complimentary' : ''} · ${pkg.id}`,
      complimentary: step.amount === 0,
    };
  }

  /** Price of a visit from Settings, matched on the treatment name (e.g. "PRP Session 3" → PRP session). */
  private visitPrice(appointment: Appointment): number {
    const type = appointment.type.toLowerCase();
    const match = this.catalog
      .findAll()
      .filter((t) => t.active && t.pricingUnit === 'session')
      .sort((a, b) => b.name.length - a.name.length)
      .find((t) => type.includes(t.name.toLowerCase()));
    return match?.price ?? 0;
  }

  private describeInvoice(invoice: Invoice): string {
    return invoice.service;
  }

  private view(
    invoice: Invoice | undefined,
    appointmentId?: string,
  ): AppointmentBill {
    if (!invoice) throw new NotFoundException('Bill not found');
    const paid = invoice.paid;
    return {
      ...(appointmentId && { appointmentId }),
      source: invoice.packageId ? 'package' : 'visit',
      ...(invoice.packageId && { packageId: invoice.packageId }),
      invoiceId: invoice.id,
      patientName: invoice.patientName,
      description: this.describeInvoice(invoice),
      issuedAt: invoice.issuedAt,
      total: invoice.amount,
      paid,
      balance: Math.max(0, invoice.amount - paid),
      status: invoice.status,
      needsCharge: false,
      complimentary: false,
      payments: this.payments.forInvoice(invoice.id),
      plan: invoice.emi ? 'emi' : 'full',
      installments: invoice.emi ? installmentViews(invoice.emi, paid) : [],
    };
  }
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Applies payments received since the plan started to its installments, in order. */
function installmentViews(
  emi: NonNullable<Invoice['emi']>,
  paidNow: number,
): InstallmentView[] {
  const today = clinicDate();
  let pool = Math.max(0, paidNow - emi.paidAtStart);
  let nextDueMarked = false;
  return emi.installments.map((inst, i) => {
    const paid = Math.min(inst.amount, pool);
    pool -= paid;
    let status: InstallmentView['status'];
    if (paid >= inst.amount) status = 'Paid';
    else if (inst.dueDate < today) status = 'Overdue';
    else if (!nextDueMarked) status = paid > 0 ? 'Part paid' : 'Due';
    else status = 'Upcoming';
    if (status !== 'Paid' && status !== 'Overdue') nextDueMarked = true;
    return {
      number: i + 1,
      dueDate: inst.dueDate,
      amount: inst.amount,
      paid,
      status,
    };
  });
}
