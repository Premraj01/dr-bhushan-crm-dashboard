import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { HairAssessmentDto } from './dto/hair-assessment.dto';
import { MedicalHistoryDto } from './dto/medical-history.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { MAX_UPLOAD_BYTES, type UploadedFileLike } from './file-store.service';
import { HistoryOverviewService } from './history-overview.service';
import { HistoryService } from './history.service';
import { PhotosService } from './photos.service';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { RequirePermission } from '../auth/require-permission.decorator';

const upload = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

function download({
  meta,
  data,
}: {
  meta: { name: string; mimeType: string };
  data: Buffer;
}) {
  return new StreamableFile(data, {
    type: meta.mimeType,
    disposition: `inline; filename="${encodeURIComponent(meta.name)}"`,
    length: data.length,
  });
}

/** History page: completeness and safety flags for every patient. */
@ApiTags('patient history')
@ApiBearerAuth()
@Controller('history')
export class HistoryOverviewController {
  constructor(private readonly overview: HistoryOverviewService) {}

  @Get()
  @RequirePermission('history', 'view')
  list() {
    return this.overview.list();
  }
}

/** Everything recorded about one patient: medical baseline, hair assessment, photos, documents. */
@ApiTags('patient history')
@ApiBearerAuth()
@Controller('patients/:id')
export class PatientHistoryController {
  constructor(
    private readonly history: HistoryService,
    private readonly photos: PhotosService,
    private readonly documents: DocumentsService,
    private readonly prescriptions: PrescriptionsService,
  ) {}

  @Get('history')
  @RequirePermission('history', 'view')
  get(@Param('id') id: string) {
    return this.history.get(id);
  }

  /** Clinical sections are recorded by clinicians. */
  @Put('history/medical')
  @RequirePermission('history', 'update')
  setMedical(
    @Param('id') id: string,
    @Body() dto: MedicalHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.history.setMedical(id, dto, user);
  }

  @Put('history/hair')
  @RequirePermission('history', 'update')
  setHair(
    @Param('id') id: string,
    @Body() dto: HairAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.history.setHair(id, dto, user);
  }

  @Get('prescriptions')
  @RequirePermission('prescriptions', 'view')
  listPrescriptions(@Param('id') id: string) {
    return this.prescriptions.list(id);
  }

  /** Prescribing outside a visit (refill, teleconsultation) — clinicians only. */
  @Post('prescriptions')
  @RequirePermission('prescriptions', 'create')
  prescribe(
    @Param('id') id: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prescriptions.create(id, dto, user);
  }

  @Get('photos')
  @RequirePermission('photos', 'view')
  listPhotos(@Param('id') id: string) {
    return this.photos.list(id);
  }

  @Post('photos')
  @RequirePermission('photos', 'upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  uploadPhoto(
    @Param('id') id: string,
    @Body() dto: UploadPhotoDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.photos.upload(id, dto, file, user);
  }

  @Get('documents')
  @RequirePermission('documents', 'view')
  listDocuments(@Param('id') id: string) {
    return this.documents.list(id);
  }

  @Post('documents')
  @RequirePermission('documents', 'upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  uploadDocument(
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.upload(id, dto, file, user);
  }
}

@ApiTags('patient history')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get(':id/file')
  @RequirePermission('photos', 'view')
  file(@Param('id') id: string) {
    return download(this.photos.content(id));
  }

  @Delete(':id')
  @RequirePermission('photos', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.photos.remove(id);
  }
}

@ApiTags('patient history')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/file')
  @RequirePermission('documents', 'view')
  file(@Param('id') id: string) {
    return download(this.documents.content(id));
  }

  @Post(':id/revoke')
  @RequirePermission('documents', 'revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.revoke(id, user);
  }

  @Delete(':id')
  @RequirePermission('documents', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.documents.remove(id);
  }
}

@ApiTags('patient history')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  /** A doctor stops the medicines early. The prescription stays on record. */
  @Post(':id/stop')
  @RequirePermission('prescriptions', 'stop')
  @HttpCode(200)
  stop(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.prescriptions.stop(id, user);
  }
}
