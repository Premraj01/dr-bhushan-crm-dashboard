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
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQuery } from './dto/list-patients.query';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermission('patients', 'view')
  findAll(@Query() query: ListPatientsQuery) {
    return this.patients.list(query);
  }

  @Get(':id')
  @RequirePermission('patients', 'view')
  findOne(@Param('id') id: string) {
    return this.patients.findOne(id);
  }

  @Post()
  @RequirePermission('patients', 'create')
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Patch(':id')
  @RequirePermission('patients', 'update')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('patients', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.patients.remove(id);
  }
}
