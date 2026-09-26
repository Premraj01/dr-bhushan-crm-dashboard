import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  REALTIME_BROADCAST,
  RealtimeMessage,
} from '../realtime/realtime.events';
import { Entity, NewEntity, SeedEntity } from './entity';
import { InMemoryRepository } from './in-memory.repository';

/**
 * Shared CRUD behaviour for clinic records. Every mutation is published as a
 * `<entity>.<action>` realtime event (e.g. `patient.created`) that the websocket
 * gateway forwards to connected dashboards.
 */
export abstract class CrudService<T extends Entity> {
  protected readonly repo: InMemoryRepository<T>;

  protected constructor(
    protected readonly events: EventEmitter2,
    protected readonly entityName: string,
    idPrefix: string,
    seed: SeedEntity<T>[],
  ) {
    this.repo = new InMemoryRepository<T>(idPrefix, seed);
  }

  findAll(): T[] {
    return this.repo.findAll();
  }

  findOne(id: string): T {
    const item = this.repo.findOne(id);
    if (!item)
      throw new NotFoundException(`${this.entityName} ${id} not found`);
    return item;
  }

  update(id: string, patch: Partial<NewEntity<T>>): T {
    const updated = this.repo.update(id, patch);
    if (!updated)
      throw new NotFoundException(`${this.entityName} ${id} not found`);
    this.publish('updated', updated);
    return updated;
  }

  remove(id: string): void {
    const item = this.findOne(id);
    this.repo.remove(id);
    this.publish('deleted', { id: item.id });
  }

  protected insert(data: NewEntity<T>): T {
    const created = this.repo.create(data);
    this.publish('created', created);
    return created;
  }

  protected publish(action: string, data: unknown) {
    const message: RealtimeMessage = {
      event: `${this.entityName}.${action}`,
      data,
    };
    this.events.emit(REALTIME_BROADCAST, message);
  }
}
