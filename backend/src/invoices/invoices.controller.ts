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
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermission('billing', 'view')
  findAll(@Query() query: ListInvoicesQuery) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @RequirePermission('billing', 'view')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Post()
  @RequirePermission('billing', 'create')
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Patch(':id')
  @RequirePermission('billing', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('billing', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.invoices.remove(id);
  }
}
