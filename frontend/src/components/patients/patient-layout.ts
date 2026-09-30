export type PatientLayout = "table" | "cards";
const LAYOUT_KEY = "drb-patients-layout";

/** The last layout picked on this device; storage can be unavailable (private mode). */
export function savedPatientLayout(): PatientLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

export function rememberPatientLayout(layout: PatientLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Not remembered; the choice still applies for this visit.
  }
}
