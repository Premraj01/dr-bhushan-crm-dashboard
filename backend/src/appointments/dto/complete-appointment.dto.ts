import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
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

export class PrescribedItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  dose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  frequency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string;
}

/**
 * "Mark completed", optionally with what the doctor prescribed and the medicines
 * given from clinic stock (taken out of inventory and billed).
 */
export class CompleteAppointmentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DispenseMedicineDto)
  medicines?: DispenseMedicineDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PrescribedItemDto)
  prescription?: PrescribedItemDto[];
}
