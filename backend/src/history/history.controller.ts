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
import { Roles } from '../auth/roles.decorator';
import { DocumentsService } from './documents.service';
import { HairAssessmentDto } from './dto/hair-assessment.dto';
import { MedicalHistoryDto } from './dto/medical-history.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { MAX_UPLOAD_BYTES, type UploadedFileLike } from './file-store.service';
import { HistoryOverviewService } from './history-overview.service';
import { HistoryService } from './history.service';
import { PhotosService } from './photos.service';

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
  ) {}

  @Get('history')
  get(@Param('id') id: string) {
    return this.history.get(id);
  }

  /** Clinical sections are recorded by clinicians. */
  @Put('history/medical')
  @Roles('Admin', 'Doctor')
  setMedical(
    @Param('id') id: string,
    @Body() dto: MedicalHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.history.setMedical(id, dto, user);
  }

  @Put('history/hair')
  @Roles('Admin', 'Doctor')
  setHair(
    @Param('id') id: string,
    @Body() dto: HairAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.history.setHair(id, dto, user);
  }

  @Get('photos')
  listPhotos(@Param('id') id: string) {
    return this.photos.list(id);
  }

  @Post('photos')
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
  listDocuments(@Param('id') id: string) {
    return this.documents.list(id);
  }

  @Post('documents')
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
  file(@Param('id') id: string) {
    return download(this.photos.content(id));
  }

  @Delete(':id')
  @Roles('Admin')
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
  file(@Param('id') id: string) {
    return download(this.documents.content(id));
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.revoke(id, user);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.documents.remove(id);
  }
}
