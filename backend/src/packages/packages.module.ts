import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PatientsModule } from '../patients/patients.module';
import { PlansModule } from '../plans/plans.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [
    PatientsModule,
    CatalogModule,
    AppointmentsModule,
    PlansModule,
    InvoicesModule,
  ],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
