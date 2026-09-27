import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { BookSessionDto } from './dto/book-session.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PackagesService } from './packages.service';

/** Treatment plans applied to a patient (packages). Open to every signed-in role for now. */
@ApiTags('packages')
@ApiBearerAuth()
@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get('patients/:patientId/packages')
  findForPatient(@Param('patientId') patientId: string) {
    return this.packages.forPatient(patientId);
  }

  @Post('patients/:patientId/packages')
  create(
    @Param('patientId') patientId: string,
    @Body() dto: CreatePackageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.packages.create(patientId, dto, user);
  }

  /** Packages whose surgery is waiting for a slot. */
  @Get('packages/pending')
  pending() {
    return this.packages.pendingQueue();
  }

  /** Plan visits coming due (next 7 days by default, or `?days=`), overdue ones included. */
  @Get('packages/due')
  due(@Query('days') days?: string) {
    const within = Number(days);
    return this.packages.dueReminders(
      Number.isInteger(within) && within >= 0 && within <= 60 ? within : 7,
    );
  }

  /** Price a package and project its dates without saving it. */
  @Post('packages/quote')
  quote(@Body() dto: CreatePackageDto) {
    return this.packages.quote(dto);
  }

  @Patch('packages/:id')
  setStatus(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.setStatus(id, dto.status);
  }

  /** Books step `index` (0-based) of the package into the appointment calendar. */
  @Post('packages/:id/sessions/:index/appointment')
  bookSession(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: BookSessionDto,
  ) {
    return this.packages.bookSession(id, index, dto);
  }
}
