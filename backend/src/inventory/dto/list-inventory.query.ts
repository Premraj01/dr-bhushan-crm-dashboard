import { IsIn, IsOptional } from 'class-validator';
import { PRODUCT_TYPES, type ProductType } from '../inventory-item.entity';

export class ListInventoryQuery {
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;
}
