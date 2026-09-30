import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [PatientsModule, InventoryModule, CatalogModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
