import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQuery } from './dto/list-appointments.query';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentsService } from './appointments.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @RequirePermission('appointments', 'view')
  findAll(@Query() query: ListAppointmentsQuery) {
    return this.appointments.list(query);
  }

  /** Each patient's next booked visit. Declared before :id so it isn't read as an id. */
  @Get('upcoming')
  @RequirePermission('appointments', 'view')
  upcoming() {
    return this.appointments.upcoming();
  }

  @Get(':id')
  @RequirePermission('appointments', 'view')
  findOne(@Param('id') id: string) {
    return this.appointments.findOne(id);
  }

  @Post()
  @RequirePermission('appointments', 'create')
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Patch(':id')
  @RequirePermission('appointments', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  /** Tick in the day list: the patient has arrived. */
  @Post(':id/check-in')
  @RequirePermission('appointments', 'checkIn')
  @HttpCode(200)
  checkIn(@Param('id') id: string) {
    return this.appointments.checkIn(id);
  }

  @Delete(':id/check-in')
  @RequirePermission('appointments', 'checkIn')
  undoCheckIn(@Param('id') id: string) {
    return this.appointments.undoCheckIn(id);
  }

  /** "Mark completed" in the appointment details. */
  @Post(':id/complete')
  @RequirePermission('appointments', 'complete')
  @HttpCode(200)
  complete(@Param('id') id: string, @Body() dto: CompleteAppointmentDto) {
    return this.appointments.complete(id, dto.medicines, dto.prescription);
  }

  /** Undo "Mark completed": the visit goes back to Checked in. */
  @Delete(':id/complete')
  @RequirePermission('appointments', 'complete')
  reopen(@Param('id') id: string) {
    return this.appointments.reopen(id);
  }

  @Delete(':id')
  @RequirePermission('appointments', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.appointments.remove(id);
  }
}
