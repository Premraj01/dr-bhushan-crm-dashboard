import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  DOCUMENT_FORMATS,
  DOCUMENT_KINDS,
  PHOTO_USES,
  type DocumentKind,
  type PhotoUse,
} from '../history.entity';

/** Multipart fields sent with the `file` part (the signed form or certificate). */
export class UploadDocumentDto {
  @IsIn(DOCUMENT_KINDS)
  kind: DocumentKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  /** When it was signed, ISO date-time. */
  @IsDateString()
  signedAt: string;

  @IsIn(DOCUMENT_FORMATS)
  format: (typeof DOCUMENT_FORMATS)[number];

  @ValidateIf((o: UploadDocumentDto) => o.kind === 'Photo consent')
  @IsIn(PHOTO_USES)
  photoUse?: PhotoUse;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
