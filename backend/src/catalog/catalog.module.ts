import { Module } from '@nestjs/common';
import {
  ConcernCatalogController,
  TreatmentCatalogController,
} from './catalog.controller';
import {
  ConcernCatalogService,
  TreatmentCatalogService,
} from './catalog.service';

@Module({
  controllers: [TreatmentCatalogController, ConcernCatalogController],
  providers: [TreatmentCatalogService, ConcernCatalogService],
  exports: [TreatmentCatalogService, ConcernCatalogService],
})
export class CatalogModule {}
