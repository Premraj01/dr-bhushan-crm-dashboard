import { Entity } from '../common/entity';

export const PRODUCT_TYPES = [
  'Tablet',
  'Capsule',
  'Oil',
  'Shampoo',
  'Conditioner',
  'Serum',
  'Solution',
  'Lotion',
  'Cream',
  'Gel',
  'Spray',
  'Supplement',
  'Other',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** SKUs and barcodes are used in URLs, so they're limited to URL-safe characters. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A product the clinic stocks and sells (medicines, shampoos, oils…). `id` is its SKU or barcode. */
export interface InventoryItem extends Entity {
  name: string;
  /** Manufacturer brand. */
  company: string;
  type: ProductType;
  /** Units currently available. */
  stockQuantity: number;
  /** At or below this count the item is flagged for reordering. */
  reorderLevel: number;
  /** Purchase price per unit, INR (up to 2 decimals). */
  costPrice: number;
  /** Retail price per unit, INR (up to 2 decimals). */
  sellingPrice: number;
  batchNo: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  imageUrl?: string | null;
}
