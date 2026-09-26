import { Injectable } from '@nestjs/common';
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
import { Invoice } from './invoice.entity';

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
    super(events, 'invoice', 'INV-', seedInvoices);
  }

  list({ status }: ListInvoicesQuery): Invoice[] {
    return this.findAll()
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  }

  create(dto: CreateInvoiceDto): Invoice {
    const patient = this.patients.findOne(dto.patientId);
    const invoice = this.insert({
      ...dto,
      patientName: patient.name,
      issuedAt: clinicDate(),
      status: dto.status ?? 'Pending',
    });
    if (invoice.status === 'Paid') this.notifyPaid(invoice);
    return invoice;
  }

  override update(id: string, dto: UpdateInvoiceDto): Invoice {
    const wasPaid = this.findOne(id).status === 'Paid';
    const invoice = super.update(id, dto);
    if (!wasPaid && invoice.status === 'Paid') this.notifyPaid(invoice);
    return invoice;
  }

  /** Drives the "Payment received" entry in the dashboard's notification bell. */
  private notifyPaid(invoice: Invoice) {
    const message: RealtimeMessage<ClinicNotification> = {
      event: 'notification',
      data: {
        tone: 'success',
        title: 'Payment received',
        message: `${inr.format(invoice.amount)} from ${invoice.patientName}`,
        at: new Date().toISOString(),
      },
    };
    this.events.emit(REALTIME_BROADCAST, message);
  }
}
