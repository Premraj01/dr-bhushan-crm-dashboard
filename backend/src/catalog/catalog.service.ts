import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CrudService } from '../common/crud.service';
import { Entity, NewEntity } from '../common/entity';
import { seedConcernOptions, seedTreatmentOptions } from '../seed/seed-data';
import { ConcernOption, TreatmentOption } from './catalog.entity';
import {
  CreateConcernOptionDto,
  UpdateConcernOptionDto,
} from './dto/concern-option.dto';
import {
  CreateTreatmentOptionDto,
  UpdateTreatmentOptionDto,
} from './dto/treatment-option.dto';

/** Named catalog entries must be unique (case-insensitive) so pickers stay unambiguous. */
abstract class NamedCatalogService<
  T extends Entity & { name: string },
> extends CrudService<T> {
  list(): T[] {
    return this.findAll().sort((a, b) => a.name.localeCompare(b.name));
  }

  protected assertUniqueName(name: string | undefined, exceptId?: string) {
    if (!name) return;
    const normalized = name.trim().toLowerCase();
    const clash = this.findAll().find(
      (item) =>
        item.id !== exceptId && item.name.trim().toLowerCase() === normalized,
    );
    if (clash) throw new ConflictException(`"${clash.name}" already exists`);
  }

  protected createNamed(data: NewEntity<T>): T {
    this.assertUniqueName(data.name);
    return this.insert({ ...data, name: data.name.trim() });
  }

  override update(id: string, patch: Partial<NewEntity<T>>): T {
    this.assertUniqueName(patch.name, id);
    return super.update(
      id,
      patch.name ? { ...patch, name: patch.name.trim() } : patch,
    );
  }
}

@Injectable()
export class TreatmentCatalogService extends NamedCatalogService<TreatmentOption> {
  constructor(events: EventEmitter2) {
    super(events, 'catalog.treatment', 'TO-', seedTreatmentOptions);
  }

  create(dto: CreateTreatmentOptionDto): TreatmentOption {
    assertDurationRange(dto.duration, dto.durationMax);
    return this.createNamed({
      ...dto,
      pricingUnit: dto.pricingUnit ?? 'session',
      surgical: dto.surgical ?? false,
      active: dto.active ?? true,
    });
  }

  override update(id: string, dto: UpdateTreatmentOptionDto): TreatmentOption {
    const current = this.findOne(id);
    // null clears a range back to a single value.
    const max =
      dto.durationMax === null
        ? undefined
        : (dto.durationMax ?? current.durationMax);
    assertDurationRange(dto.duration ?? current.duration, max ?? undefined);
    return super.update(id, dto);
  }
}

function assertDurationRange(min: number, max: number | null | undefined) {
  if (max != null && max <= min) {
    throw new BadRequestException('durationMax must be greater than duration');
  }
}

@Injectable()
export class ConcernCatalogService extends NamedCatalogService<ConcernOption> {
  constructor(events: EventEmitter2) {
    super(events, 'catalog.concern', 'CO-', seedConcernOptions);
  }

  create(dto: CreateConcernOptionDto): ConcernOption {
    return this.createNamed({ ...dto, active: dto.active ?? true });
  }

  override update(id: string, dto: UpdateConcernOptionDto): ConcernOption {
    return super.update(id, dto);
  }
}
