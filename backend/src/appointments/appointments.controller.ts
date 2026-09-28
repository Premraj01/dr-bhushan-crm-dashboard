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
import { Roles } from '../auth/roles.decorator';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQuery } from './dto/list-appointments.query';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  findAll(@Query() query: ListAppointmentsQuery) {
    return this.appointments.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointments.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  /** Tick in the day list: the patient has arrived. */
  @Post(':id/check-in')
  @HttpCode(200)
  checkIn(@Param('id') id: string) {
    return this.appointments.checkIn(id);
  }

  @Delete(':id/check-in')
  undoCheckIn(@Param('id') id: string) {
    return this.appointments.undoCheckIn(id);
  }

  /** "Mark completed" in the appointment details. */
  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string, @Body() dto: CompleteAppointmentDto) {
    return this.appointments.complete(id, dto.medicines);
  }

  /** Undo "Mark completed": the visit goes back to Checked in. */
  @Delete(':id/complete')
  reopen(@Param('id') id: string) {
    return this.appointments.reopen(id);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.appointments.remove(id);
  }
}
