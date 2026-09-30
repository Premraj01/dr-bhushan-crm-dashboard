import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InviteUserDto } from './dto/invite-user.dto';
import { UsersService } from './users.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('team')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Team members and their access status (Settings → Team access). */
  @Get()
  @RequirePermission('team', 'view')
  findAll() {
    return this.users.findAll().map((u) => this.users.toPublic(u));
  }

  @Post('invite')
  @RequirePermission('team', 'invite')
  invite(@Body() dto: InviteUserDto) {
    return this.users.toPublic(this.users.invite(dto));
  }
}
