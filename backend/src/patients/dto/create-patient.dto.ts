import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  /** Indian or international number, e.g. "+91 98230 78142". */
  @Matches(/^\+?[0-9][0-9 -]{6,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  concern?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
