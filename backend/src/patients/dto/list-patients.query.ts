import { IsOptional, IsString } from 'class-validator';

export class ListPatientsQuery {
  /** Matches name, patient ID or phone number. */
  @IsOptional()
  @IsString()
  search?: string;
}
