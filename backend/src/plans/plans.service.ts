import { ConflictException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TreatmentCatalogService } from '../catalog/catalog.service';
import { CrudService } from '../common/crud.service';
import { seedTreatmentPlans } from '../seed/seed-data';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto';
import { normalizeItems } from './plan-steps';
import { TreatmentPlan } from './plan.entity';

/** Settings → Treatment plans: reusable combinations of treatments with gaps between them. */
@Injectable()
export class PlansService extends CrudService<TreatmentPlan> {
  constructor(
    events: EventEmitter2,
    private readonly catalog: TreatmentCatalogService,
  ) {
    super(events, 'plan', 'TP-', seedTreatmentPlans);
  }

  list(): TreatmentPlan[] {
    return this.findAll().sort((a, b) => a.name.localeCompare(b.name));
  }

  create(dto: CreateTreatmentPlanDto, createdBy: string): TreatmentPlan {
    this.assertUniqueName(dto.name);
    return this.insert({
      name: dto.name.trim(),
      ...(dto.description?.trim() && { description: dto.description.trim() }),
      items: normalizeItems(dto.items, (id) => this.treatment(id)),
      active: dto.active ?? true,
      createdBy,
    });
  }

  override update(id: string, dto: UpdateTreatmentPlanDto): TreatmentPlan {
    this.findOne(id);
    if (dto.name) this.assertUniqueName(dto.name, id);
    return super.update(id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description.trim(),
      }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.items && {
        items: normalizeItems(dto.items, (tid) => this.treatment(tid)),
      }),
    });
  }

  private treatment(id: string) {
    return this.catalog.findAll().find((t) => t.id === id);
  }

  private assertUniqueName(name: string, exceptId?: string) {
    const normalized = name.trim().toLowerCase();
    const clash = this.findAll().find(
      (p) => p.id !== exceptId && p.name.trim().toLowerCase() === normalized,
    );
    if (clash) throw new ConflictException(`"${clash.name}" already exists`);
  }
}
