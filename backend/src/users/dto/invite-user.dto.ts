import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ROLES, type Role } from '../user.entity';

export class InviteUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsIn(ROLES)
  role: Role;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
