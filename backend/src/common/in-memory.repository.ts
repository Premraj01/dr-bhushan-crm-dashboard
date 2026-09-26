import { Entity, NewEntity, SeedEntity } from './entity';

/**
 * Process-local storage used until a database is chosen. Every service reads and
 * writes through this class, so swapping it for a real repository (Prisma, TypeORM, …)
 * is contained to one place per module. Data resets on restart.
 */
export class InMemoryRepository<T extends Entity> {
  private readonly items = new Map<string, T>();
  private sequence = 0;

  constructor(
    private readonly idPrefix: string,
    seed: SeedEntity<T>[] = [],
  ) {
    const now = new Date().toISOString();
    for (const item of seed) {
      this.items.set(item.id, { ...item, createdAt: now, updatedAt: now } as T);
      const n = Number(item.id.slice(idPrefix.length));
      if (Number.isFinite(n)) this.sequence = Math.max(this.sequence, n);
    }
  }

  findAll(): T[] {
    return [...this.items.values()];
  }

  findOne(id: string): T | undefined {
    return this.items.get(id);
  }

  create(data: NewEntity<T>): T {
    const now = new Date().toISOString();
    const id = `${this.idPrefix}${++this.sequence}`;
    const item = { ...data, id, createdAt: now, updatedAt: now } as T;
    this.items.set(id, item);
    return item;
  }

  update(id: string, patch: Partial<NewEntity<T>>): T | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...stripUndefined(patch),
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
