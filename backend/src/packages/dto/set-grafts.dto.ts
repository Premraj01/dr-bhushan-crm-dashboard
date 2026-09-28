import { IsInt, Max, Min } from 'class-validator';

/** The actual number of grafts, known once the surgery is under way or done. */
export class SetGraftsDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  grafts: number;
}
