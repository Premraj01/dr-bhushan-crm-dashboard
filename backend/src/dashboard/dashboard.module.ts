import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LeadsModule } from '../leads/leads.module';
import { PackagesModule } from '../packages/packages.module';
import { PatientsModule } from '../patients/patients.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    PatientsModule,
    AppointmentsModule,
    LeadsModule,
    InvoicesModule,
    PackagesModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
