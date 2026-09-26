import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CONCERN_ILLUSTRATIONS,
  type ConcernIllustration,
} from '../catalog.entity';

export class CreateConcernOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Optional built-in drawing, e.g. a Norwood stage. */
  @IsOptional()
  @IsIn(CONCERN_ILLUSTRATIONS)
  illustration?: ConcernIllustration;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateConcernOptionDto extends PartialType(
  CreateConcernOptionDto,
) {}
