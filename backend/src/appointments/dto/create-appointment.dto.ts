import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** Minimal registration for a first-time patient, done while booking. */
export class NewPatientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Matches(/^\+?[0-9][0-9 -]{6,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;
}

export class CreateAppointmentDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  /** Registers a new patient (name + phone) and books for them. Use instead of `patientId`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewPatientDto)
  newPatient?: NewPatientDto;

  /** Required when `patientId` is not given; otherwise taken from the patient record. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  patientName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  type: string;

  @IsString()
  @IsNotEmpty()
  doctor: string;

  /** ISO 8601 with offset, e.g. "2026-09-27T10:30:00+05:30". */
  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  /** Consecutive days for surgery that spans more than one day (1–3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
