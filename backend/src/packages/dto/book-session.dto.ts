import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Books one package session into the appointment calendar. */
export class BookSessionDto {
  /** ISO 8601 with offset, e.g. "2026-09-30T10:00:00+05:30". */
  @IsDateString()
  startsAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  doctor: string;

  /** Days the surgery takes (1–3). Only used for surgery steps. */
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
