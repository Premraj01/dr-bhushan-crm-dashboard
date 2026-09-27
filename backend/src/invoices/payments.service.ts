import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { NewEntity } from '../common/entity';
import { seedPayments } from '../seed/seed-data';
import { Payment } from './payment.entity';

@Injectable()
export class PaymentsService extends CrudService<Payment> {
  constructor(events: EventEmitter2) {
    super(events, 'payment', 'PAY-', seedPayments);
  }

  forInvoice(invoiceId: string): Payment[] {
    return this.findAll()
      .filter((p) => p.invoiceId === invoiceId)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  record(data: Omit<NewEntity<Payment>, 'receivedAt'>): Payment {
    return this.insert({ ...data, receivedAt: new Date().toISOString() });
  }
}
