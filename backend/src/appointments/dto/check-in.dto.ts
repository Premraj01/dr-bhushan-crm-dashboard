import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { NewPatientDto } from './create-appointment.dto';

export class CheckInDto {
  /**
   * Registers a walk-in (an appointment with no patient record) as a patient at
   * check-in. A patient already on file with this phone number is linked instead.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewPatientDto)
  newPatient?: NewPatientDto;
}
