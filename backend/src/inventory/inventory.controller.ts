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
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  findAll(@Query() query: ListInventoryQuery) {
    return this.inventory.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventory.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventory.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventory.update(id, dto);
  }

  /** Every role can restock or record a sale; only the count changes. */
  @Post(':id/stock')
  @HttpCode(200)
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.inventory.adjustStock(id, dto.change);
  }

  @Delete(':id')
  @Roles('Admin')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.inventory.remove(id);
  }
}
