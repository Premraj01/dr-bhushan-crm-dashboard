export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields a caller supplies when creating a record; id and timestamps are generated. */
export type NewEntity<T extends Entity> = Omit<T, keyof Entity>;

/** Seed records carry fixed ids so they match the data the frontend was prototyped with. */
export type SeedEntity<T extends Entity> = Omit<T, 'createdAt' | 'updatedAt'>;
