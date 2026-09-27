import { IsIn } from 'class-validator';
import { type PackageStatus } from '../package.entity';

/** Packages start Accepted; afterwards they can only be completed or cancelled. */
const STATUS_CHANGES = [
  'Completed',
  'Cancelled',
] as const satisfies readonly PackageStatus[];

export class UpdatePackageDto {
  @IsIn(STATUS_CHANGES)
  status: (typeof STATUS_CHANGES)[number];
}
