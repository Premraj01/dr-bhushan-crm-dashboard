import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LeadsModule } from '../leads/leads.module';
import { PatientsModule } from '../patients/patients.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PatientsModule, AppointmentsModule, LeadsModule, InvoicesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
