import { IsInt, Max, Min, NotEquals } from 'class-validator';

export class AdjustStockDto {
  /** Units added (restock, positive) or removed (sold / dispensed / damaged, negative). */
  @IsInt()
  @NotEquals(0)
  @Min(-1_000_000)
  @Max(1_000_000)
  change: number;
}
