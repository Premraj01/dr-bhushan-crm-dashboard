import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StoredFile } from './history.entity';

/** The parts of a multer upload this module uses. */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** File signatures — the type is taken from the bytes, never from the client's claim. */
const SIGNATURES: { mimeType: string; test: (b: Buffer) => boolean }[] = [
  {
    mimeType: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    test: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    test: (b) =>
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mimeType: 'application/pdf',
    test: (b) => b.toString('ascii', 0, 5) === '%PDF-',
  },
];

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/**
 * Photos and scanned forms. Kept in process memory like every other record until a
 * database / object store is chosen, so they reset on restart. Swap this class for
 * disk or S3 storage without touching the services that use it.
 */
@Injectable()
export class FileStore {
  private readonly files = new Map<
    string,
    { meta: StoredFile; data: Buffer }
  >();

  save(file: UploadedFileLike | undefined, allowed: string[]): StoredFile {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a file');
    const mimeType = SIGNATURES.find((s) => s.test(file.buffer))?.mimeType;
    if (!mimeType || !allowed.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type — use ${allowed.map((t) => t.split('/')[1].toUpperCase()).join(', ')}`,
      );
    }
    const meta: StoredFile = {
      fileId: randomUUID(),
      name: file.originalname.slice(0, 200) || 'file',
      mimeType,
      size: file.size,
    };
    this.files.set(meta.fileId, { meta, data: Buffer.from(file.buffer) });
    return meta;
  }

  read(fileId: string): { meta: StoredFile; data: Buffer } {
    const file = this.files.get(fileId);
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  remove(fileId: string) {
    this.files.delete(fileId);
  }
}
