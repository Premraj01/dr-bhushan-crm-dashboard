import { AlertTriangle, Droplet, ShieldAlert, ShieldCheck } from "lucide-react";
import { safetyAlerts, type PatientHistory } from "./history-api";

/**
 * Allergies, bleeding-risk medication, infectious conditions and pending clearance —
 * shown at the top of the profile and the history so nobody misses them before a procedure.
 */
export function SafetyStrip({ history }: { history: PatientHistory | undefined }) {
  const alerts = safetyAlerts(history);
  if (!alerts) {
    return (
      <p className="safety-strip safety-unknown">
        <AlertTriangle />
        Medical history not recorded — check allergies and medication before any procedure.
      </p>
    );
  }
  const items = [
    alerts.allergies.length > 0 && {
      icon: ShieldAlert,
      tone: "danger",
      text: `Allergies: ${alerts.allergies.join(", ")}`,
    },
    alerts.bleeding.length > 0 && {
      icon: Droplet,
      tone: "danger",
      text: `Affects bleeding: ${alerts.bleeding.join(", ")}`,
    },
    alerts.infectious.length > 0 && {
      icon: AlertTriangle,
      tone: "warning",
      text: `Infection precautions: ${alerts.infectious.join(", ")}`,
    },
    alerts.clearancePending && {
      icon: AlertTriangle,
      tone: "warning",
      text: "Medical clearance pending",
    },
  ].filter((x) => !!x);
  if (items.length === 0) {
    return (
      <p className="safety-strip safety-ok">
        <ShieldCheck />
        {alerts.noKnownAllergies ? "No known drug allergies" : "No allergies recorded"} · no
        bleeding-risk medication
      </p>
    );
  }
  return (
    <ul className="safety-strip" aria-label="Safety alerts">
      {items.map(({ icon: Icon, tone, text }) => (
        <li key={text} className={`safety-${tone}`}>
          <Icon />
          {text}
        </li>
      ))}
    </ul>
  );
}
