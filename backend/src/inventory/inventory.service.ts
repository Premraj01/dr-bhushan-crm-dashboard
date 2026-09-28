import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { NewEntity } from '../common/entity';
import {
  ClinicNotification,
  REALTIME_BROADCAST,
  RealtimeMessage,
} from '../realtime/realtime.events';
import { seedInventory } from '../seed/seed-data';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { InventoryItem } from './inventory-item.entity';

@Injectable()
export class InventoryService extends CrudService<InventoryItem> {
  constructor(events: EventEmitter2) {
    super(events, 'inventory', 'INV-', seedInventory());
  }

  list({ type }: ListInventoryQuery): InventoryItem[] {
    return this.findAll()
      .filter((item) => !type || item.type === type)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  create({ itemId, ...dto }: CreateInventoryItemDto): InventoryItem {
    const sku = itemId.trim();
    // Barcode scanners and people type SKUs in either case; treat them as the same item.
    const clash = this.findAll().find(
      (item) => item.id.toLowerCase() === sku.toLowerCase(),
    );
    if (clash)
      throw new ConflictException(
        `SKU ${clash.id} is already used by "${clash.name}"`,
      );
    return this.insert(
      {
        ...dto,
        name: dto.name.trim(),
        company: dto.company.trim(),
        batchNo: dto.batchNo.trim(),
      },
      sku,
    );
  }

  override update(
    id: string,
    patch: Partial<NewEntity<InventoryItem>>,
  ): InventoryItem {
    const before = this.findOne(id);
    const updated = super.update(id, patch);
    this.notifyIfLow(before, updated);
    return updated;
  }

  /** Restock (positive) or sell / dispense / write off (negative) units. */
  adjustStock(id: string, change: number): InventoryItem {
    const item = this.findOne(id);
    const stockQuantity = item.stockQuantity + change;
    if (stockQuantity < 0)
      throw new BadRequestException(
        `Only ${item.stockQuantity} of "${item.name}" in stock`,
      );
    return this.update(id, { stockQuantity });
  }

  /** Warns the dashboard bell when an item first drops to its reorder level. */
  private notifyIfLow(before: InventoryItem, after: InventoryItem) {
    const wasLow = before.stockQuantity <= before.reorderLevel;
    if (wasLow || after.stockQuantity > after.reorderLevel) return;
    const message: RealtimeMessage<ClinicNotification> = {
      event: 'notification',
      data: {
        tone: 'warning',
        title: after.stockQuantity === 0 ? 'Out of stock' : 'Low stock',
        message: `${after.name} · ${after.stockQuantity} left (reorder at ${after.reorderLevel})`,
        at: new Date().toISOString(),
      },
    };
    this.events.emit(REALTIME_BROADCAST, message);
  }
}
