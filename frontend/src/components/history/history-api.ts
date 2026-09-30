import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "@/lib/api";
import { useLiveInvalidate } from "@/components/patients/patients-api";
import type { PrescribedItem } from "@/components/appointments/appointments-api";

/* ---------- medical history & clinical baseline ---------- */

export const SEVERITIES = ["Mild", "Moderate", "Severe"] as const;
export const CLEARANCE_STATUSES = ["Not required", "Pending", "Received"] as const;

export type Edited = { updatedBy: { id: string; name: string }; updatedAt: string };

export type Allergy = {
  substance: string;
  reaction?: string;
  severity?: (typeof SEVERITIES)[number];
};
export type Condition = { name: string; status: "Current" | "Past"; notes?: string };
export type Medication = { name: string; dose?: string; affectsBleeding: boolean; notes?: string };
export type PastSurgery = { procedure: string; when?: string; notes?: string };

export type MedicalHistory = {
  noKnownAllergies: boolean;
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  surgeries: PastSurgery[];
  clearance: (typeof CLEARANCE_STATUSES)[number];
  clearanceNotes?: string;
  notes?: string;
};

/** Quick picks for the forms — anything else can be typed. */
export const COMMON_ALLERGIES = [
  "Lidocaine",
  "Latex",
  "Penicillin",
  "Sulfa drugs",
  "Cephalosporins",
  "NSAIDs",
  "Chlorhexidine",
  "Adhesive tape",
];
export const COMMON_CONDITIONS = [
  "Hypertension",
  "Diabetes",
  "Bleeding disorder",
  "Thyroid disorder",
  "Heart disease",
  "Alopecia areata",
  "Other autoimmune disease",
  "Keloid tendency",
  "HIV",
  "Hepatitis B",
  "Hepatitis C",
];
/** Flagged as affecting bleeding or healing when picked. */
export const BLEEDING_RISK_DRUGS = [
  "Aspirin",
  "Warfarin",
  "Clopidogrel",
  "Apixaban",
  "Rivaroxaban",
  "Ibuprofen",
  "Fish oil / Omega-3",
  "Vitamin E",
  "Ginkgo biloba",
  "Garlic supplements",
];
export const COMMON_MEDICATIONS = [
  ...BLEEDING_RISK_DRUGS,
  "Finasteride",
  "Dutasteride",
  "Minoxidil (oral)",
  "Minoxidil (topical)",
  "Amlodipine",
  "Metformin",
  "Levothyroxine",
  "Biotin",
];
export const INFECTIOUS = ["HIV", "Hepatitis B", "Hepatitis C"];

/* ---------- hair loss & treatment ---------- */

export const HAIR_GRADES = {
  Norwood: ["I", "II", "IIa", "III", "IIIa", "III vertex", "IV", "IVa", "V", "Va", "VI", "VII"],
  Ludwig: ["I", "II", "III"],
} as const;
export type HairScale = keyof typeof HAIR_GRADES;
export const DONOR_QUALITIES = ["Excellent", "Good", "Average", "Poor"] as const;
export const DONOR_LAXITIES = ["High", "Moderate", "Low"] as const;
export const COMMON_TREATMENTS = [
  "PRP therapy",
  "GFC therapy",
  "Minoxidil",
  "Finasteride",
  "Laser cap / LLLT",
  "Mesotherapy",
  "FUE transplant",
  "FUT transplant",
];

export type HairAssessment = {
  scale: HairScale;
  grade: string;
  donor: {
    quality?: (typeof DONOR_QUALITIES)[number];
    density?: number;
    laxity?: (typeof DONOR_LAXITIES)[number];
    notes?: string;
  };
  treatments: { treatment: string; period?: string; outcome?: string }[];
  goals: { hairline?: string; targetGrafts?: number; densityNotes?: string; expectations?: string };
};

export type PatientHistory = {
  patientId: string;
  medical?: MedicalHistory & Edited;
  hair?: HairAssessment & Edited;
  /** Medicines the clinic currently has the patient on (active prescriptions). */
  prescribed: (PrescriptionItem & { prescriptionId: string })[];
};

/* ---------- prescriptions ---------- */

export type PrescriptionItem = PrescribedItem & {
  /** Given from clinic stock at the visit. */
  dispensed?: number;
  affectsBleeding: boolean;
};

export type Prescription = {
  id: string;
  patientId: string;
  appointmentId?: string;
  visit?: string;
  prescribedBy: string;
  prescribedAt: string;
  items: PrescriptionItem[];
  notes?: string;
  stoppedAt?: string;
  stoppedBy?: string;
  active: boolean;
  /** YYYY-MM-DD the longest course ends; absent when ongoing. */
  endsOn?: string;
};

/* ---------- photos & documents ---------- */

export type StoredFile = { fileId: string; name: string; mimeType: string; size: number };

export const PHOTO_ANGLES = [
  "Frontal hairline",
  "Top / vertex",
  "Crown",
  "Left profile",
  "Right profile",
  "Back (donor area)",
  "Wet hair",
] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const PHOTO_MILESTONES = [
  "Initial assessment",
  "Surgery day",
  "Day 1 post-op",
  "1 month",
  "3 months",
  "6 months",
  "1 year",
  "Other",
] as const;
export type PhotoMilestone = (typeof PHOTO_MILESTONES)[number];

export type PatientPhoto = {
  id: string;
  patientId: string;
  angle: PhotoAngle;
  milestone: PhotoMilestone;
  takenOn: string;
  note?: string;
  file: StoredFile;
  uploadedBy: { id: string; name: string };
  createdAt: string;
};

export const DOCUMENT_KINDS = [
  "Surgery consent",
  "Photo consent",
  "Medical clearance",
  "Other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_FORMATS = ["Digital", "Physical (scanned)"] as const;
export const PHOTO_USES = ["Education only", "Marketing & education"] as const;

export type PatientDocument = {
  id: string;
  patientId: string;
  kind: DocumentKind;
  title: string;
  signedAt: string;
  format: (typeof DOCUMENT_FORMATS)[number];
  photoUse?: (typeof PHOTO_USES)[number];
  notes?: string;
  file: StoredFile;
  uploadedBy: { id: string; name: string };
  createdAt: string;
  revokedAt?: string;
  revokedBy?: { id: string; name: string };
};

/** Largest upload the server accepts. */
export const MAX_UPLOAD_MB = 20;

/* ---------- financial ---------- */

export type InvoiceStatus = "Paid" | "Partially paid" | "Pending" | "Overdue" | "Cancelled";
export type Invoice = {
  id: string;
  patientId?: string;
  service: string;
  issuedAt: string;
  amount: number;
  paid: number;
  status: InvoiceStatus;
  packageId?: string;
  appointmentId?: string;
  emi?: { installments: { dueDate: string; amount: number }[] } | null;
};

/* ---------- hooks ---------- */

export function useHistory(patientId: string | null) {
  const query = useQuery({
    queryKey: ["history", patientId],
    queryFn: () => api<PatientHistory>(`/patients/${patientId}/history`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(["history", patientId], ["history.created", "history.updated"]);
  return query;
}

function useSaveSection<T>(patientId: string, section: "medical" | "hair") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: T) =>
      api<PatientHistory>(`/patients/${patientId}/history/${section}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["history", patientId], data);
      void queryClient.invalidateQueries({ queryKey: ["history", "overview"] });
    },
  });
}

export const useSaveMedical = (patientId: string) =>
  useSaveSection<MedicalHistory>(patientId, "medical");
export const useSaveHair = (patientId: string) => useSaveSection<HairAssessment>(patientId, "hair");

export function usePhotos(patientId: string | null) {
  const query = useQuery({
    queryKey: ["photos", patientId],
    queryFn: () => api<PatientPhoto[]>(`/patients/${patientId}/photos`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(["photos", patientId], ["photo.created", "photo.deleted"]);
  return query;
}

export function useDocuments(patientId: string | null) {
  const query = useQuery({
    queryKey: ["documents", patientId],
    queryFn: () => api<PatientDocument[]>(`/patients/${patientId}/documents`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(
    ["documents", patientId],
    ["document.created", "document.updated", "document.deleted"],
  );
  return query;
}

function toForm(file: File, fields: Record<string, string | undefined>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  form.append("file", file);
  return form;
}

export function useUploadPhoto(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      ...fields
    }: {
      file: File;
      angle: PhotoAngle;
      milestone: PhotoMilestone;
      takenOn: string;
      note?: string;
    }) =>
      api<PatientPhoto>(`/patients/${patientId}/photos`, {
        method: "POST",
        body: toForm(file, fields),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["photos", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["history", "overview"] });
    },
  });
}

export function useUploadDocument(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      ...fields
    }: {
      file: File;
      kind: DocumentKind;
      title: string;
      signedAt: string;
      format: PatientDocument["format"];
      photoUse?: PatientDocument["photoUse"];
      notes?: string;
    }) =>
      api<PatientDocument>(`/patients/${patientId}/documents`, {
        method: "POST",
        body: toForm(file, fields),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["history", "overview"] });
    },
  });
}

export function useRemoveRecord(kind: "photos" | "documents", patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [kind, patientId] });
      void queryClient.invalidateQueries({ queryKey: ["history", "overview"] });
    },
  });
}

export function useRevokeDocument(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PatientDocument>(`/documents/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["history", "overview"] });
    },
  });
}

export function usePatientInvoices(patientId: string | null) {
  const query = useQuery({
    queryKey: ["billing", "invoices", patientId],
    queryFn: () => api<Invoice[]>(`/invoices?patientId=${encodeURIComponent(patientId!)}`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(["billing", "invoices", patientId], ["invoice.created", "invoice.updated"]);
  return query;
}

/**
 * An object URL for a protected file (photos and documents need the auth header, so
 * they can't be plain <img src>). Revoked when the component unmounts.
 */
export function useFileUrl(path: string | null) {
  const {
    data: blob,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["file", path],
    queryFn: () => apiBlob(path!),
    enabled: path !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return { url, isPending: path !== null && isPending, isError };
}

/** Opens a stored document in a new tab (PDF viewer or image). */
export async function openFile(path: string) {
  // Opened before the fetch so the popup blocker treats it as part of the click.
  const tab = window.open("", "_blank");
  let blob: Blob;
  try {
    blob = await apiBlob(path);
  } catch (e) {
    tab?.close();
    throw e;
  }
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function usePrescriptions(patientId: string | null) {
  const query = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: () => api<Prescription[]>(`/patients/${patientId}/prescriptions`),
    enabled: patientId !== null,
    retry: 1,
  });
  useLiveInvalidate(
    ["prescriptions", patientId],
    ["prescription.created", "prescription.updated", "prescription.deleted"],
  );
  return query;
}

function useRefreshPrescriptions(patientId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
    // Active medicines and safety alerts come with the history.
    void queryClient.invalidateQueries({ queryKey: ["history"] });
  };
}

export function useCreatePrescription(patientId: string) {
  const refresh = useRefreshPrescriptions(patientId);
  return useMutation({
    mutationFn: (body: { items: PrescribedItem[]; notes?: string }) =>
      api<Prescription>(`/patients/${patientId}/prescriptions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
}

export function useStopPrescription(patientId: string) {
  const refresh = useRefreshPrescriptions(patientId);
  return useMutation({
    mutationFn: (id: string) => api<Prescription>(`/prescriptions/${id}/stop`, { method: "POST" }),
    onSuccess: refresh,
  });
}

/**
 * Safety flags shown wherever the patient is opened. `recorded` is false when there is
 * no medical history yet — prescribed blood thinners are still flagged.
 */
export function safetyAlerts(history: PatientHistory | undefined) {
  if (!history) return null;
  const m = history.medical;
  const prescribedBleeding = history.prescribed.filter((x) => x.affectsBleeding).map((x) => x.name);
  return {
    recorded: !!m,
    allergies: (m?.allergies ?? []).map((a) =>
      a.severity === "Severe" ? `${a.substance} (severe)` : a.substance,
    ),
    noKnownAllergies: m?.noKnownAllergies ?? false,
    bleeding: [
      ...new Set([
        ...(m?.medications ?? []).filter((x) => x.affectsBleeding).map((x) => x.name),
        ...prescribedBleeding,
      ]),
    ],
    infectious: (m?.conditions ?? [])
      .filter((c) => c.status === "Current" && INFECTIOUS.includes(c.name))
      .map((c) => c.name),
    clearancePending: m?.clearance === "Pending",
  };
}

/* ---------- History page ---------- */

export type ConsentState = "Signed" | "Withdrawn" | "Missing";

export type HistorySummary = {
  patientId: string;
  patientName: string;
  gender?: string;
  age?: number;
  concern?: string;
  medicalRecorded: boolean;
  hairGrade?: string;
  allergies: string[];
  bleedingRisk: string[];
  infectious: string[];
  clearance?: MedicalHistory["clearance"];
  photos: number;
  latestMilestone?: string;
  surgeryConsent: ConsentState;
  photoConsent: ConsentState;
  photoUse?: string;
  updatedAt?: string;
};

export function useHistoryOverview() {
  const query = useQuery({
    queryKey: ["history", "overview"],
    queryFn: () => api<HistorySummary[]>("/history"),
    retry: 1,
  });
  useLiveInvalidate(
    ["history", "overview"],
    [
      "history.created",
      "history.updated",
      "photo.created",
      "photo.deleted",
      "document.created",
      "document.updated",
      "document.deleted",
      "patient.created",
      "patient.updated",
    ],
  );
  return query;
}
