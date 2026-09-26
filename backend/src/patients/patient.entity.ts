import { Entity } from '../common/entity';

export interface Patient extends Entity {
  name: string;
  /** Unknown for quick registrations made while booking. */
  age?: number;
  phone: string;
  email?: string;
  /** Recorded at consultation; empty for quick registrations. */
  concern?: string;
  /** Current plan summary, e.g. "PRP · Session 3/6". */
  treatment: string;
  /** YYYY-MM-DD; absent until the patient's first visit. */
  lastVisit?: string;
  notes?: string;
}
