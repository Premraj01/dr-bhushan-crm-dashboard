import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  LOCKED_ROLES,
  PERMISSIONS,
  permissionsOf,
  setRolePermissions,
} from '../auth/permissions';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  REALTIME_BROADCAST,
  type RealtimeMessage,
} from '../realtime/realtime.events';
import { ROLES, type Role } from '../users/user.entity';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

/** Settings → Roles & permissions. */
@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly events: EventEmitter2) {}

  /** Every module's actions, and what each role currently has. */
  @Get()
  @RequirePermission('team', 'view')
  list() {
    return {
      modules: PERMISSIONS,
      roles: ROLES.map((role) => this.view(role)),
    };
  }

  /** Replaces the role's permissions; signed-in members of that role get them at once. */
  @Put(':role/permissions')
  @RequirePermission('team', 'manageRoles')
  update(@Param('role') role: string, @Body() dto: UpdateRolePermissionsDto) {
    if (!isRole(role)) throw new NotFoundException(`Role ${role} not found`);
    setRolePermissions(role, dto.permissions);
    const updated = this.view(role);
    this.events.emit(REALTIME_BROADCAST, {
      event: 'role.updated',
      data: updated,
    } satisfies RealtimeMessage);
    return updated;
  }

  private view(role: Role) {
    return {
      role,
      permissions: permissionsOf(role),
      locked: LOCKED_ROLES.includes(role),
    };
  }
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
