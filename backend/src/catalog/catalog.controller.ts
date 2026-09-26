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
import {
  ConcernCatalogService,
  TreatmentCatalogService,
} from './catalog.service';
import {
  CreateConcernOptionDto,
  UpdateConcernOptionDto,
} from './dto/concern-option.dto';
import {
  CreateTreatmentOptionDto,
  UpdateTreatmentOptionDto,
} from './dto/treatment-option.dto';

/** Settings → Treatments. Everyone can read; only admins can change the catalog. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('catalog/treatments')
export class TreatmentCatalogController {
  constructor(private readonly treatments: TreatmentCatalogService) {}

  @Get()
  findAll() {
    return this.treatments.list();
  }

  @Post()
  @Roles('Admin')
  create(@Body() dto: CreateTreatmentOptionDto) {
    return this.treatments.create(dto);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentOptionDto) {
    return this.treatments.update(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.treatments.remove(id);
  }
}

/** Settings → Concerns. Everyone can read; only admins can change the catalog. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('catalog/concerns')
export class ConcernCatalogController {
  constructor(private readonly concerns: ConcernCatalogService) {}

  @Get()
  findAll() {
    return this.concerns.list();
  }

  @Post()
  @Roles('Admin')
  create(@Body() dto: CreateConcernOptionDto) {
    return this.concerns.create(dto);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() dto: UpdateConcernOptionDto) {
    return this.concerns.update(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.concerns.remove(id);
  }
}
