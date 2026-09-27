import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PackagesModule } from '../packages/packages.module';
import {
  BillingController,
  BillingOverviewController,
  InvoiceBillingController,
} from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AppointmentsModule, PackagesModule, InvoicesModule, CatalogModule],
  controllers: [
    BillingController,
    InvoiceBillingController,
    BillingOverviewController,
  ],
  providers: [BillingService],
})
export class BillingModule {}
