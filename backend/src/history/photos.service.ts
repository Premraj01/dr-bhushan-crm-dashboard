import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '../auth/auth-user';
import { CrudService } from '../common/crud.service';
import { PatientsService } from '../patients/patients.service';
import { demoPhotos } from './demo-files';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { FileStore, IMAGE_TYPES, UploadedFileLike } from './file-store.service';
import { PatientPhoto, PHOTO_ANGLES, PHOTO_MILESTONES } from './history.entity';

/** Clinical photographs: the before & after vault. */
@Injectable()
export class PhotosService extends CrudService<PatientPhoto> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
    private readonly files: FileStore,
  ) {
    super(events, 'photo', 'PH-', demoPhotos(files));
  }

  /** Timeline order (pre-op first), then the standard angle order. */
  list(patientId: string): PatientPhoto[] {
    this.patients.findOne(patientId);
    const m = (p: PatientPhoto) => PHOTO_MILESTONES.indexOf(p.milestone);
    const a = (p: PatientPhoto) => PHOTO_ANGLES.indexOf(p.angle);
    return this.findAll()
      .filter((p) => p.patientId === patientId)
      .sort(
        (x, y) =>
          m(x) - m(y) ||
          x.takenOn.localeCompare(y.takenOn) ||
          a(x) - a(y) ||
          x.createdAt.localeCompare(y.createdAt),
      );
  }

  upload(
    patientId: string,
    dto: UploadPhotoDto,
    file: UploadedFileLike | undefined,
    user: AuthUser,
  ): PatientPhoto {
    this.patients.findOne(patientId);
    const stored = this.files.save(file, IMAGE_TYPES);
    return this.insert({
      patientId,
      ...dto,
      file: stored,
      uploadedBy: { id: user.id, name: user.name },
    });
  }

  content(id: string) {
    return this.files.read(this.findOne(id).file.fileId);
  }

  override remove(id: string) {
    const photo = this.findOne(id);
    super.remove(id);
    this.files.remove(photo.file.fileId);
  }
}
