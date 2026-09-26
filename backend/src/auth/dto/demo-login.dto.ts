import { IsIn } from 'class-validator';
import { ROLES, type Role } from '../../users/user.entity';

export class DemoLoginDto {
  @IsIn(ROLES)
  role: Role;
}
