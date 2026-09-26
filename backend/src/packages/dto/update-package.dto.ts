import { IsIn } from 'class-validator';
import { PACKAGE_STATUSES, type PackageStatus } from '../package.entity';

export class UpdatePackageDto {
  @IsIn(PACKAGE_STATUSES)
  status: PackageStatus;
}
