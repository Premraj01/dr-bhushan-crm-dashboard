import { Entity } from '../common/entity';

export const LEAD_SOURCES = [
  'Instagram',
  'WhatsApp',
  'Referral',
  'Website',
  'Walk-in',
  'Other',
] as const;
export const LEAD_STAGES = [
  'New',
  'Contacted',
  'Consultation',
  'Qualified',
  'Converted',
  'Lost',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadStage = (typeof LEAD_STAGES)[number];

export interface Lead extends Entity {
  name: string;
  phone?: string;
  source: LeadSource;
  interest: string;
  /** Potential value in INR (whole rupees). */
  value: number;
  /** Next follow-up, e.g. "Call today". */
  nextAction: string;
  stage: LeadStage;
  notes?: string;
}
