import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PackagesModule } from '../packages/packages.module';
import { PatientsModule } from '../patients/patients.module';
import {
  BillingController,
  BillingOverviewController,
  InvoiceBillingController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { InvoicePdfService } from './invoice-pdf.service';

@Module({
  imports: [
    AppointmentsModule,
    PackagesModule,
    InvoicesModule,
    CatalogModule,
    PatientsModule,
  ],
  controllers: [
    BillingController,
    InvoiceBillingController,
    BillingOverviewController,
  ],
  providers: [BillingService, InvoicePdfService],
})
export class BillingModule {}
