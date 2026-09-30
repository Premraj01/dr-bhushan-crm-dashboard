import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { GENDERS, type Gender } from '../patient.entity';

/** Indian or international number, e.g. "+91 98230 78142". */
const PHONE = /^\+?[0-9][0-9 -]{6,19}$/;

export class EmergencyContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  relationship: string;

  @Matches(PHONE, {
    message: 'emergency contact phone must be a valid phone number',
  })
  phone: string;
}

export class CreatePatientDto {
  /** Required unless firstName/lastName are given, in which case it is built from them. */
  @ValidateIf((o: CreatePatientDto) => o.firstName === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @ValidateIf((o: CreatePatientDto) => o.firstName !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @Matches(PHONE, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;

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
