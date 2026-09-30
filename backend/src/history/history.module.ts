import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { DocumentsService } from './documents.service';
import { FileStore } from './file-store.service';
import {
  DocumentsController,
  HistoryOverviewController,
  PrescriptionsController,
  PatientHistoryController,
  PhotosController,
} from './history.controller';
import { HistoryOverviewService } from './history-overview.service';
import { HistoryService } from './history.service';
import { PhotosService } from './photos.service';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [PatientsModule],
  controllers: [
    PatientHistoryController,
    PhotosController,
    DocumentsController,
    HistoryOverviewController,
    PrescriptionsController,
  ],
  providers: [
    FileStore,
    HistoryService,
    HistoryOverviewService,
    PhotosService,
    DocumentsService,
    PrescriptionsService,
  ],
})
export class HistoryModule {}
