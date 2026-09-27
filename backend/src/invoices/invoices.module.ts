import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PatientsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentsService],
  exports: [InvoicesService, PaymentsService],
})
export class InvoicesModule {}
