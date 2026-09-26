import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { InviteUserDto } from './dto/invite-user.dto';
import { UsersService } from './users.service';

@ApiTags('team')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Team members and their access status (Settings → Team access). */
  @Get()
  findAll() {
    return this.users.findAll().map((u) => this.users.toPublic(u));
  }

  @Post('invite')
  @Roles('Admin')
  invite(@Body() dto: InviteUserDto) {
    return this.users.toPublic(this.users.invite(dto));
  }
}
