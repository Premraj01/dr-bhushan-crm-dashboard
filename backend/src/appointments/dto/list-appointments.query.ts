import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '../appointment.entity';

export class ListAppointmentsQuery {
  /** Clinic-local calendar day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  /** Clinic-local month (YYYY-MM), for calendar views. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  doctor?: string;

  @IsOptional()
  @IsIn(APPOINTMENT_STATUSES)
  status?: AppointmentStatus;
}
