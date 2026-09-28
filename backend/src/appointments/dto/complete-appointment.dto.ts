import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DispenseMedicineDto {
  /** Inventory SKU. */
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

/** "Mark completed", optionally with the medicines the doctor recommended. */
export class CompleteAppointmentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DispenseMedicineDto)
  medicines?: DispenseMedicineDto[];
}
