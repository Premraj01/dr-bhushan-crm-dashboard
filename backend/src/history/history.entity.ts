import { Entity } from '../common/entity';

/** Who last changed a section, shown as "Updated by … on …". */
export interface Edited {
  updatedBy: { id: string; name: string };
  updatedAt: string;
}

/* ---------- medical history & clinical baseline ---------- */

export const SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONDITION_STATUSES = ['Current', 'Past'] as const;
export type ConditionStatus = (typeof CONDITION_STATUSES)[number];

export const CLEARANCE_STATUSES = [
  'Not required',
  'Pending',
  'Received',
] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export interface Allergy {
  /** Drug or material, e.g. "Lidocaine", "Latex". */
  substance: string;
  reaction?: string;
  severity?: Severity;
}

export interface Condition {
  /** e.g. "Hypertension", "Hepatitis B", "Alopecia areata". */
  name: string;
  status: ConditionStatus;
  notes?: string;
}

export interface Medication {
  /** Drug or supplement, e.g. "Aspirin 75 mg", "Ginkgo biloba". */
  name: string;
  dose?: string;
  /** Blood thinners and supplements that affect bleeding or healing. */
  affectsBleeding: boolean;
  notes?: string;
}

export interface PastSurgery {
  procedure: string;
  /** Free text: "2019", "Mar 2021". */
  when?: string;
  notes?: string;
}

export interface MedicalHistory extends Edited {
  /** Confirmed "no known drug allergies" — different from allergies never asked about. */
  noKnownAllergies: boolean;
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  surgeries: PastSurgery[];
  /** Clearance from the patient's physician or cardiologist before surgery. */
  clearance: ClearanceStatus;
  clearanceNotes?: string;
  notes?: string;
}

/* ---------- hair loss & treatment specifics ---------- */

export const HAIR_SCALES = ['Norwood', 'Ludwig'] as const;
export type HairScale = (typeof HAIR_SCALES)[number];

export const HAIR_GRADES: Record<HairScale, readonly string[]> = {
  Norwood: [
    'I',
    'II',
    'IIa',
    'III',
    'IIIa',
    'III vertex',
    'IV',
    'IVa',
    'V',
    'Va',
    'VI',
    'VII',
  ],
  Ludwig: ['I', 'II', 'III'],
};

export const DONOR_QUALITIES = [
  'Excellent',
  'Good',
  'Average',
  'Poor',
] as const;
export const DONOR_LAXITIES = ['High', 'Moderate', 'Low'] as const;

export interface DonorAssessment {
  quality?: (typeof DONOR_QUALITIES)[number];
  /** Follicular units per cm². */
  density?: number;
  /** Scalp laxity — matters for strip (FUT) harvesting. */
  laxity?: (typeof DONOR_LAXITIES)[number];
  notes?: string;
}

export interface PreviousTreatment {
  /** e.g. "PRP therapy", "Minoxidil 5%", "Laser cap", "FUE transplant". */
  treatment: string;
  /** Free text: "2022 – 2023", "6 months". */
  period?: string;
  outcome?: string;
}

export interface PatientGoals {
  hairline?: string;
  targetGrafts?: number;
  densityNotes?: string;
  expectations?: string;
}

export interface HairAssessment extends Edited {
  scale: HairScale;
  grade: string;
  donor: DonorAssessment;
  treatments: PreviousTreatment[];
  goals: PatientGoals;
}

/** One per patient; each section is absent until first recorded. */
export interface PatientHistory extends Entity {
  patientId: string;
  medical?: MedicalHistory;
  hair?: HairAssessment;
}

/* ---------- files: photos and documents ---------- */

export interface StoredFile {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
}

export const PHOTO_ANGLES = [
  'Frontal hairline',
  'Top / vertex',
  'Crown',
  'Left profile',
  'Right profile',
  'Back (donor area)',
  'Wet hair',
] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const PHOTO_MILESTONES = [
  'Pre-operative',
  'Day 1 post-op',
  '1 month',
  '3 months',
  '6 months',
  '1 year',
  'Other',
] as const;
export type PhotoMilestone = (typeof PHOTO_MILESTONES)[number];

export interface PatientPhoto extends Entity {
  patientId: string;
  angle: PhotoAngle;
  milestone: PhotoMilestone;
  /** YYYY-MM-DD */
  takenOn: string;
  note?: string;
  file: StoredFile;
  uploadedBy: { id: string; name: string };
}

export const DOCUMENT_KINDS = [
  'Surgery consent',
  'Photo consent',
  'Medical clearance',
  'Other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_FORMATS = ['Digital', 'Physical (scanned)'] as const;

/** What a photo consent allows; photos are always anonymised. */
export const PHOTO_USES = ['Education only', 'Marketing & education'] as const;
export type PhotoUse = (typeof PHOTO_USES)[number];

export interface PatientDocument extends Entity {
  patientId: string;
  kind: DocumentKind;
  title: string;
  /** When the patient (or physician, for clearance) signed it — ISO. */
  signedAt: string;
  format: (typeof DOCUMENT_FORMATS)[number];
  /** Photo consents only. */
  photoUse?: PhotoUse;
  notes?: string;
  file: StoredFile;
  uploadedBy: { id: string; name: string };
  /** Consents can be withdrawn; the signed copy is kept. */
  revokedAt?: string;
  revokedBy?: { id: string; name: string };
}

/* ---------- prescriptions ---------- */

/**
 * Blood thinners and supplements that affect bleeding, matched by name so a
 * prescription can raise the same safety alert as the medical history.
 */
export const BLEEDING_RISK = [
  'aspirin',
  'warfarin',
  'clopidogrel',
  'apixaban',
  'rivaroxaban',
  'dabigatran',
  'ibuprofen',
  'diclofenac',
  'naproxen',
  'fish oil',
  'omega-3',
  'vitamin e',
  'ginkgo',
  'garlic',
];

export interface PrescriptionItem {
  name: string;
  itemId?: string;
  dose?: string;
  frequency?: string;
  /** Absent = ongoing until stopped. */
  durationDays?: number;
  instructions?: string;
  /** Given from clinic stock at the visit. */
  dispensed?: number;
  affectsBleeding: boolean;
}

/** Medicines a doctor prescribed — at a visit, or from the patient's history. */
export interface Prescription extends Entity {
  patientId: string;
  /** The visit it was written at; absent when prescribed from the history. */
  appointmentId?: string;
  /** e.g. "PRP Session 3", "Follow-up". */
  visit?: string;
  prescribedBy: string;
  /** ISO */
  prescribedAt: string;
  items: PrescriptionItem[];
  notes?: string;
  /** Stopped early by a doctor. */
  stoppedAt?: string;
  stoppedBy?: string;
}
