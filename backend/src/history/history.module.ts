import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { DocumentsService } from './documents.service';
import { FileStore } from './file-store.service';
import {
  DocumentsController,
  HistoryOverviewController,
  PatientHistoryController,
  PhotosController,
} from './history.controller';
import { HistoryOverviewService } from './history-overview.service';
import { HistoryService } from './history.service';
import { PhotosService } from './photos.service';

@Module({
  imports: [PatientsModule],
  controllers: [
    PatientHistoryController,
    PhotosController,
    DocumentsController,
    HistoryOverviewController,
  ],
  providers: [
    FileStore,
    HistoryService,
    HistoryOverviewService,
    PhotosService,
    DocumentsService,
  ],
})
export class HistoryModule {}
