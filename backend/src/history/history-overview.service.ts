import { Injectable } from '@nestjs/common';
import { PatientsService } from '../patients/patients.service';
import { DocumentsService } from './documents.service';
import { HistoryService } from './history.service';
import { PatientDocument, PHOTO_MILESTONES } from './history.entity';
import { PhotosService } from './photos.service';

const INFECTIOUS = new Set(['HIV', 'Hepatitis B', 'Hepatitis C']);

type ConsentState = 'Signed' | 'Withdrawn' | 'Missing';

export interface HistorySummary {
  patientId: string;
  patientName: string;
  gender?: string;
  age?: number;
  concern?: string;
  medicalRecorded: boolean;
  /** "Norwood IV", "Ludwig II". */
  hairGrade?: string;
  allergies: string[];
  bleedingRisk: string[];
  infectious: string[];
  clearance?: string;
  photos: number;
  /** Latest milestone photographed, e.g. "3 months". */
  latestMilestone?: string;
  surgeryConsent: ConsentState;
  photoConsent: ConsentState;
  photoUse?: string;
  /** Last change to any part of the history (ISO). */
  updatedAt?: string;
}

/** One row per patient for the History page. */
@Injectable()
export class HistoryOverviewService {
  constructor(
    private readonly patients: PatientsService,
    private readonly history: HistoryService,
    private readonly photos: PhotosService,
    private readonly documents: DocumentsService,
  ) {}

  list(): HistorySummary[] {
    const photos = this.photos.findAll();
    const docs = this.documents.findAll();
    return this.patients.list({}).map((p) => {
      const { medical, hair } = this.history.get(p.id);
      const own = photos.filter((x) => x.patientId === p.id);
      const ownDocs = docs
        .filter((d) => d.patientId === p.id)
        .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
      const photoConsent = ownDocs.find((d) => d.kind === 'Photo consent');
      const latest = own
        .map((x) => PHOTO_MILESTONES.indexOf(x.milestone))
        .filter((i) => PHOTO_MILESTONES[i] !== 'Other')
        .sort((a, b) => b - a)[0];
      const updatedAt = [
        medical?.updatedAt,
        hair?.updatedAt,
        ...own.map((x) => x.createdAt),
        ...ownDocs.map((d) => d.updatedAt),
      ]
        .filter((d): d is string => !!d)
        .sort()
        .pop();
      return {
        patientId: p.id,
        patientName: p.name,
        ...(p.gender && { gender: p.gender }),
        ...(p.age != null && { age: p.age }),
        ...(p.concern && { concern: p.concern }),
        medicalRecorded: !!medical,
        ...(hair && { hairGrade: `${hair.scale} ${hair.grade}` }),
        allergies: medical?.allergies.map((a) => a.substance) ?? [],
        bleedingRisk:
          medical?.medications
            .filter((m) => m.affectsBleeding)
            .map((m) => m.name) ?? [],
        infectious:
          medical?.conditions
            .filter((c) => c.status === 'Current' && INFECTIOUS.has(c.name))
            .map((c) => c.name) ?? [],
        ...(medical && { clearance: medical.clearance }),
        photos: own.length,
        ...(latest !== undefined && {
          latestMilestone: PHOTO_MILESTONES[latest],
        }),
        surgeryConsent: consent(
          ownDocs.find((d) => d.kind === 'Surgery consent'),
        ),
        photoConsent: consent(photoConsent),
        ...(photoConsent?.photoUse &&
          !photoConsent.revokedAt && { photoUse: photoConsent.photoUse }),
        ...(updatedAt && { updatedAt }),
      };
    });
  }
}

function consent(doc: PatientDocument | undefined): ConsentState {
  if (!doc) return 'Missing';
  return doc.revokedAt ? 'Withdrawn' : 'Signed';
}
