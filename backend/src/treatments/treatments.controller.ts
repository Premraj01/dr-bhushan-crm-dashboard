import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { TreatmentsService } from './treatments.service';

@ApiTags('treatments')
@ApiBearerAuth()
@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly treatments: TreatmentsService) {}

  @Get()
  findAll() {
    return this.treatments.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.treatments.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTreatmentDto) {
    return this.treatments.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentDto) {
    return this.treatments.update(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.treatments.remove(id);
  }
}
