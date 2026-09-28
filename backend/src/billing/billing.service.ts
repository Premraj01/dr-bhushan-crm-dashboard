import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_COMPLETED,
  APPOINTMENT_REOPENED,
  type Appointment,
} from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuthUser } from '../auth/auth-user';
import { TreatmentCatalogService } from '../catalog/catalog.service';
import { addDays, clinicDate } from '../common/dates';
import { Invoice, InvoiceLine, invoiceTotal } from '../invoices/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { Payment } from '../invoices/payment.entity';
import { PaymentsService } from '../invoices/payments.service';
import { PackagesService } from '../packages/packages.service';
import { PatientsService } from '../patients/patients.service';
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
  patientId?: string;
  patientName: string;
  /** For sending the invoice by WhatsApp or email. */
  contact: { phone?: string; email?: string };
  description: string;
  /** What's billed: the treatment and any medicines given at the visit. */
  items: InvoiceLine[];
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
    private readonly patients: PatientsService,
  ) {}

  /* ---------- from the calendar (appointment) ---------- */

  bill(appointmentId: string): AppointmentBill {
    const appointment = this.appointments.findOne(appointmentId);
    const invoice = this.existingInvoice(appointment);
    if (invoice) return this.view(invoice, appointment);

    // Not billed yet: show what this visit will cost.
    const session = this.packageSession(appointment);
    const items = this.visitLines(appointment);
    const total = invoiceTotal(items);
    return {
      appointmentId: appointment.id,
      source: session ? 'package' : 'visit',
      ...(appointment.packageId && { packageId: appointment.packageId }),
      ...(appointment.patientId && { patientId: appointment.patientId }),
      patientName: appointment.patientName,
      contact: this.contactOf(appointment.patientId),
      description: session ? session.description : appointment.type,
      items,
      total,
      paid: 0,
      balance: total,
      status: 'Not billed',
      needsCharge: !session && total === 0,
      complimentary: !!session?.complimentary && total === 0,
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

  /**
   * A completed visit that hasn't been paid is owed: open its bill as Pending so it
   * shows on the Billing page and in the dashboard's billed/outstanding figures.
   * Complimentary visits have nothing to pay; a visit without a price in Settings stays
   * "Not billed" until its charge is entered with the first payment.
   */
  @OnEvent(APPOINTMENT_COMPLETED)
  onAppointmentCompleted(appointment: Appointment) {
    const existing = this.existingInvoice(appointment);
    if (existing) {
      // Paid in advance: the medicines given at the visit are added to the same bill.
      const medicines = medicineLines(appointment);
      if (medicines.length) this.invoices.addLines(existing.id, medicines);
      return;
    }
    if (invoiceTotal(this.visitLines(appointment)) > 0)
      this.ensureInvoice(appointment);
  }

  /** Undoing completion drops the bill it opened, as long as nothing has been paid on it. */
  @OnEvent(APPOINTMENT_REOPENED)
  onAppointmentReopened(appointment: Appointment) {
    const invoice = this.existingInvoice(appointment);
    if (!invoice || invoice.paid > 0 || invoice.emi) return;
    this.invoices.remove(invoice.id);
    this.appointments.setBillStatus(appointment.id, null);
  }

  /* ---------- from the Billing page (invoice) ---------- */

  invoiceBill(invoiceId: string): AppointmentBill {
    return this.view(this.invoices.findOne(invoiceId));
  }

  /** Everything the printable invoice shows. */
  invoiceDocument(invoiceId: string) {
    const invoice = this.invoices.findOne(invoiceId);
    const appointment = invoice.appointmentId
      ? this.appointments.findAll().find((a) => a.id === invoice.appointmentId)
      : undefined;
    return {
      invoice,
      lines: this.invoices.linesOf(invoice),
      patient: invoice.patientId
        ? this.patients.findAll().find((p) => p.id === invoice.patientId)
        : undefined,
      appointment,
      payments: this.payments.forInvoice(invoice.id),
      installments: invoice.emi
        ? installmentViews(invoice.emi, invoice.paid)
        : [],
    };
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
    if (existing) {
      // Billed for medicines only so far: the visit charge comes with the first payment.
      const hasService = this.invoices
        .linesOf(existing)
        .some((l) => l.kind === 'service');
      if (charge && !hasService && !existing.packageId)
        return this.invoices.addLines(existing.id, [
          serviceLine(appointment.type, charge),
        ]);
      return existing;
    }
    const session = this.packageSession(appointment);
    const items = this.visitLines(appointment, charge);
    if (invoiceTotal(items) === 0) {
      throw new BadRequestException(
        session
          ? 'This is a complimentary session — there is nothing to pay'
          : `Enter the charge for "${appointment.type}" with the first payment`,
      );
    }
    return this.invoices.open({
      ...(appointment.patientId && { patientId: appointment.patientId }),
      patientName: appointment.patientName,
      service: session ? session.description : appointment.type,
      items,
      ...(session &&
        appointment.packageId && { packageId: appointment.packageId }),
      appointmentId: appointment.id,
    });
  }

  /**
   * A visit's bill: its treatment (package step price, Settings price, or the charge
   * entered with the first payment) followed by the medicines given at completion.
   */
  private visitLines(appointment: Appointment, charge?: number): InvoiceLine[] {
    const session = this.packageSession(appointment);
    const price = session
      ? session.charge
      : this.visitPrice(appointment) || charge || 0;
    const service =
      session || price > 0
        ? [serviceLine(session ? session.description : appointment.type, price)]
        : [];
    return [...service, ...medicineLines(appointment)];
  }

  private contactOf(patientId: string | undefined): AppointmentBill['contact'] {
    const patient = patientId
      ? this.patients.findAll().find((p) => p.id === patientId)
      : undefined;
    return {
      ...(patient?.phone && { phone: patient.phone }),
      ...(patient?.email && { email: patient.email }),
    };
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
    appointment?: Appointment,
  ): AppointmentBill {
    if (!invoice) throw new NotFoundException('Bill not found');
    const paid = invoice.paid;
    const items = this.invoices.linesOf(invoice);
    return {
      ...(appointment && { appointmentId: appointment.id }),
      source: invoice.packageId ? 'package' : 'visit',
      ...(invoice.packageId && { packageId: invoice.packageId }),
      invoiceId: invoice.id,
      ...(invoice.patientId && { patientId: invoice.patientId }),
      patientName: invoice.patientName,
      contact: this.contactOf(invoice.patientId),
      description: this.describeInvoice(invoice),
      items,
      issuedAt: invoice.issuedAt,
      total: invoice.amount,
      paid,
      balance: Math.max(0, invoice.amount - paid),
      status: invoice.status,
      // Opened for medicines only: the visit's own charge is still to be entered.
      needsCharge:
        !!appointment &&
        !invoice.packageId &&
        !items.some((l) => l.kind === 'service'),
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

function serviceLine(description: string, price: number): InvoiceLine {
  return {
    kind: 'service',
    description,
    quantity: 1,
    unitPrice: price,
    amount: price,
  };
}

function medicineLines(appointment: Appointment): InvoiceLine[] {
  return (appointment.medicines ?? []).map((m) => ({
    kind: 'medicine',
    description: m.name,
    quantity: m.quantity,
    unitPrice: m.unitPrice,
    // To the paisa; the invoice total is rounded to whole rupees.
    amount: Math.round(m.quantity * m.unitPrice * 100) / 100,
    itemId: m.itemId,
    batchNo: m.batchNo,
  }));
}
