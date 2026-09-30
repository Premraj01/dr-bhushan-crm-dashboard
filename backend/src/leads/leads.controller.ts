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
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQuery } from './dto/list-leads.query';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermission('leads', 'view')
  findAll(@Query() query: ListLeadsQuery) {
    return this.leads.list(query);
  }

  @Get(':id')
  @RequirePermission('leads', 'view')
  findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }

  @Post()
  @RequirePermission('leads', 'create')
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  @Patch(':id')
  @RequirePermission('leads', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('leads', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.leads.remove(id);
  }
}
