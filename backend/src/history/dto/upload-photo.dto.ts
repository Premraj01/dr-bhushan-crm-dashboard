import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PHOTO_ANGLES,
  PHOTO_MILESTONES,
  type PhotoAngle,
  type PhotoMilestone,
} from '../history.entity';

/** Multipart fields sent with the `file` part. */
export class UploadPhotoDto {
  @IsIn(PHOTO_ANGLES)
  angle: PhotoAngle;

  @IsIn(PHOTO_MILESTONES)
  milestone: PhotoMilestone;

  @IsDateString({ strict: true })
  takenOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
