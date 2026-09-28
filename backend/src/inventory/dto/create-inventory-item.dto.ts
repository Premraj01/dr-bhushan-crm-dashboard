import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PRODUCT_TYPES,
  SKU_PATTERN,
  type ProductType,
} from '../inventory-item.entity';

const MONEY = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class CreateInventoryItemDto {
  /** SKU or barcode; becomes the item's id and can't be changed later. */
  @Matches(SKU_PATTERN, {
    message: 'itemId must be 1–64 letters, digits, dots, dashes or underscores',
  })
  itemId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  company: string;

  @IsIn(PRODUCT_TYPES)
  type: ProductType;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockQuantity: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderLevel: number;

  @IsNumber(MONEY)
  @Min(0)
  costPrice: number;

  @IsNumber(MONEY)
  @Min(0)
  sellingPrice: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  batchNo: string;

  @IsDateString({ strict: true })
  expiryDate: string;

  /** An http(s) URL or a path on the clinic site (e.g. /products/x.svg); null clears it. */
  @IsOptional()
  @Matches(/^(https?:\/\/\S+|\/[\w\-./]+)$/, {
    message: 'imageUrl must be an http(s) URL or a path starting with /',
  })
  @MaxLength(500)
  imageUrl?: string | null;
}
