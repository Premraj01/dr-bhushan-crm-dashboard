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
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryService } from './inventory.service';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermission('inventory', 'view')
  findAll(@Query() query: ListInventoryQuery) {
    return this.inventory.list(query);
  }

  @Get(':id')
  @RequirePermission('inventory', 'view')
  findOne(@Param('id') id: string) {
    return this.inventory.findOne(id);
  }

  @Post()
  @RequirePermission('inventory', 'create')
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventory.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventory.update(id, dto);
  }

  /** Every role can restock or record a sale; only the count changes. */
  @Post(':id/stock')
  @RequirePermission('inventory', 'adjustStock')
  @HttpCode(200)
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.inventory.adjustStock(id, dto.change);
  }

  @Delete(':id')
  @RequirePermission('inventory', 'delete')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    this.inventory.remove(id);
  }
}
