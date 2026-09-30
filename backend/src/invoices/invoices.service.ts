import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { clinicDate } from '../common/dates';
import { PatientsService } from '../patients/patients.service';
import {
  ClinicNotification,
  REALTIME_BROADCAST,
  RealtimeMessage,
} from '../realtime/realtime.events';
import { seedInvoices } from '../seed/seed-data';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import {
  INVOICE_CHANGED,
  Invoice,
  InvoiceLine,
  invoiceTotal,
} from './invoice.entity';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

@Injectable()
export class InvoicesService extends CrudService<Invoice> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
  ) {
    // Continues the INV-26091 numbering used by the seed data.
    super(events, 'invoice', 'INV-', seedInvoices());
  }

  list({ status, patientId }: ListInvoicesQuery): Invoice[] {
    return this.findAll()
      .filter((i) => !status || i.status === status)
      .filter((i) => !patientId || i.patientId === patientId)
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  }

  create(dto: CreateInvoiceDto): Invoice {
    const patient = this.patients.findOne(dto.patientId);
    const status = dto.status ?? 'Pending';
    const invoice = this.insert({
      ...dto,
      patientName: patient.name,
      issuedAt: clinicDate(),
      paid: status === 'Paid' ? dto.amount : 0,
      status,
    });
    if (invoice.status === 'Paid') this.notifyPaid(invoice);
    return invoice;
  }

  override update(id: string, dto: UpdateInvoiceDto): Invoice {
    const current = this.findOne(id);
    const wasPaid = current.status === 'Paid';
    const invoice = super.update(id, {
      ...dto,
      // Marking an invoice Paid by hand settles it in full.
      ...(dto.status === 'Paid' && { paid: dto.amount ?? current.amount }),
    });
    if (!wasPaid && invoice.status === 'Paid') this.notifyPaid(invoice);
    return invoice;
  }

  /** Opens the invoice for a package or a stand-alone visit (see BillingService). */
  open(data: {
    patientId?: string;
    patientName: string;
    service: string;
    items: InvoiceLine[];
    packageId?: string;
    appointmentId?: string;
  }): Invoice {
    return this.insert({
      ...data,
      amount: invoiceTotal(data.items),
      issuedAt: clinicDate(),
      paid: 0,
      status: 'Pending',
    });
  }

  /** The invoice's lines; older invoices are one service line for the whole amount. */
  linesOf(invoice: Invoice): InvoiceLine[] {
    return (
      invoice.items ?? [
        {
          kind: 'service',
          description: invoice.service,
          quantity: 1,
          unitPrice: invoice.amount,
          amount: invoice.amount,
        },
      ]
    );
  }

  /**
   * Adds lines to a bill (medicines given at the visit, or a visit charge entered later).
   * On a bill paid in EMIs the extra is added to the last installment.
   */
  addLines(id: string, lines: InvoiceLine[]): Invoice {
    const invoice = this.findOne(id);
    if (invoice.status === 'Cancelled')
      throw new BadRequestException(`${invoice.id} is cancelled`);
    const items = [...this.linesOf(invoice), ...lines];
    const amount = invoiceTotal(items);
    const extra = amount - invoice.amount;
    const emi = invoice.emi && {
      ...invoice.emi,
      installments: invoice.emi.installments.map((inst, i, all) =>
        i === all.length - 1 ? { ...inst, amount: inst.amount + extra } : inst,
      ),
    };
    return super.update(id, {
      items,
      amount,
      ...(emi && { emi }),
      status:
        invoice.paid >= amount
          ? 'Paid'
          : invoice.paid > 0
            ? 'Partially paid'
            : invoice.status === 'Paid'
              ? 'Pending'
              : invoice.status,
    });
  }

  /** Sets (or with null, removes) the invoice's EMI plan. */
  setEmi(id: string, emi: Invoice['emi']): Invoice {
    return super.update(id, { emi });
  }

  /**
   * New price for an open bill (a surgery's actual graft count). Refused when more has
   * already been received, or while an EMI plan is split over the old balance.
   */
  reprice(
    id: string,
    { amount: charge, service }: { amount: number; service: string },
  ): Invoice {
    const invoice = this.findOne(id);
    // Only the treatment line changes; medicines given at the visit stay on the bill.
    const lines = this.linesOf(invoice);
    const items = lines.some((l) => l.kind === 'service')
      ? lines.map((l) =>
          l.kind === 'service'
            ? { ...l, description: service, unitPrice: charge, amount: charge }
            : l,
        )
      : lines;
    return this.setTotal(invoice, invoiceTotal(items), {
      service,
      ...(invoice.items && { items }),
    });
  }

  /**
   * New total for an open bill. Refused when more has already been received, or while
   * an EMI plan is split over the old balance.
   */
  private setTotal(
    invoice: Invoice,
    amount: number,
    patch: Partial<Pick<Invoice, 'service' | 'items'>>,
  ): Invoice {
    const id = invoice.id;
    if (amount === invoice.amount) return super.update(id, patch);
    if (amount < invoice.paid) {
      throw new BadRequestException(
        `${inr.format(invoice.paid)} has already been received on ${invoice.id} — more than the new total of ${inr.format(amount)}`,
      );
    }
    if (invoice.emi) {
      throw new BadRequestException(
        `${invoice.id} is being paid in EMIs. Remove the EMI plan first, then set it up again for the new amount`,
      );
    }
    const status =
      invoice.paid >= amount
        ? 'Paid'
        : invoice.paid > 0
          ? 'Partially paid'
          : invoice.status === 'Paid' || invoice.status === 'Partially paid'
            ? 'Pending'
            : invoice.status;
    return super.update(id, { ...patch, amount, status });
  }

  /** Adds a received payment to the invoice and settles its status. */
  applyPayment(id: string, amount: number): Invoice {
    const invoice = this.findOne(id);
    const paid = invoice.paid + amount;
    const status = paid >= invoice.amount ? 'Paid' : 'Partially paid';
    const updated = super.update(id, { paid, status });
    this.notifyPaid(updated, amount);
    return updated;
  }

  /** Also tells AppointmentsService, so a visit shows whether its bill is paid. */
  protected override publish(action: string, data: unknown) {
    super.publish(action, data);
    if (action !== 'deleted') this.events.emit(INVOICE_CHANGED, data);
  }

  /** Drives the "Payment received" entry in the dashboard's notification bell. */
  private notifyPaid(invoice: Invoice, amount = invoice.amount) {
    const message: RealtimeMessage<ClinicNotification> = {
      event: 'notification',
      data: {
        tone: 'success',
        title: 'Payment received',
        message: `${inr.format(amount)} from ${invoice.patientName}`,
        at: new Date().toISOString(),
      },
    };
    this.events.emit(REALTIME_BROADCAST, message);
  }
}
