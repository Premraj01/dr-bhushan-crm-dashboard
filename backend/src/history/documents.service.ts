import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '../auth/auth-user';
import { CrudService } from '../common/crud.service';
import { PatientsService } from '../patients/patients.service';
import { demoDocuments } from './demo-files';
import { UploadDocumentDto } from './dto/upload-document.dto';
import {
  DOCUMENT_TYPES,
  FileStore,
  UploadedFileLike,
} from './file-store.service';
import { PatientDocument } from './history.entity';

const CONSENTS = new Set(['Surgery consent', 'Photo consent']);

/** Signed consent forms, photo-use consent and medical clearance certificates. */
@Injectable()
export class DocumentsService extends CrudService<PatientDocument> {
  constructor(
    events: EventEmitter2,
    private readonly patients: PatientsService,
    private readonly files: FileStore,
  ) {
    super(events, 'document', 'DOC-', demoDocuments(files));
  }

  /** Newest signature first. */
  list(patientId: string): PatientDocument[] {
    this.patients.findOne(patientId);
    return this.findAll()
      .filter((d) => d.patientId === patientId)
      .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
  }

  upload(
    patientId: string,
    { photoUse, ...dto }: UploadDocumentDto,
    file: UploadedFileLike | undefined,
    user: AuthUser,
  ): PatientDocument {
    this.patients.findOne(patientId);
    if (new Date(dto.signedAt).getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException('signedAt cannot be in the future');
    }
    const stored = this.files.save(file, DOCUMENT_TYPES);
    return this.insert({
      patientId,
      ...dto,
      signedAt: new Date(dto.signedAt).toISOString(),
      ...(dto.kind === 'Photo consent' && { photoUse }),
      file: stored,
      uploadedBy: { id: user.id, name: user.name },
    });
  }

  /** The patient withdrew consent. The signed copy stays on record. */
  revoke(id: string, user: AuthUser): PatientDocument {
    const doc = this.findOne(id);
    if (!CONSENTS.has(doc.kind)) {
      throw new BadRequestException('Only consent forms can be withdrawn');
    }
    if (doc.revokedAt) {
      throw new BadRequestException('This consent was already withdrawn');
    }
    return this.update(id, {
      revokedAt: new Date().toISOString(),
      revokedBy: { id: user.id, name: user.name },
    });
  }

  content(id: string) {
    return this.files.read(this.findOne(id).file.fileId);
  }

  override remove(id: string) {
    const doc = this.findOne(id);
    super.remove(id);
    this.files.remove(doc.file.fileId);
  }
}
