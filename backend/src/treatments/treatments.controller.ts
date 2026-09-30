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
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { TreatmentsService } from './treatments.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('treatments')
@ApiBearerAuth()
@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly treatments: TreatmentsService) {}

  @Get()
  @RequirePermission('treatments', 'view')
  findAll() {
    return this.treatments.list();
  }

  @Get(':id')
  @RequirePermission('treatments', 'view')
  findOne(@Param('id') id: string) {
    return this.treatments.findOne(id);
  }

  @Post()
  @RequirePermission('treatments', 'create')
  create(@Body() dto: CreateTreatmentDto) {
    return this.treatments.create(dto);
  }

  @Patch(':id')
  @RequirePermission('treatments', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentDto) {
    return this.treatments.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('treatments', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.treatments.remove(id);
  }
}
