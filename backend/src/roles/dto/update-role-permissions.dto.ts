import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { ALL_PERMISSIONS } from '../../auth/permissions';

export class UpdateRolePermissionsDto {
  /** The role's complete permission list, e.g. `["patients.view", "patients.create"]`. */
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: string[];
}
