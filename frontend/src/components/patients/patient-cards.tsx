import { LayoutGrid, Mail, MapPin, Phone, Table2 } from "lucide-react";
import {
  clinicDateOf,
  clinicTimeOf,
  useUpcomingVisits,
} from "@/components/appointments/appointments-api";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import type { PatientLayout } from "./patient-layout";
import { formatDay, formatVisit, type Patient } from "./patients-api";

/** Table / Cards switch, same as the Inventory page. */
export function LayoutToggle({
  value,
  onChange,
}: {
  value: PatientLayout;
  onChange: (layout: PatientLayout) => void;
}) {
  return (
    <div className="layout-toggle" role="radiogroup" aria-label="Layout">
      {(
        [
          ["table", "Table", Table2],
          ["cards", "Cards", LayoutGrid],
        ] as const
      ).map(([layout, label, Icon]) => (
        <Button
          key={layout}
          type="button"
          variant="ghost"
          size="sm"
          role="radio"
          aria-checked={value === layout}
          className={cn(value === layout && "is-active")}
          onClick={() => onChange(layout)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  );
}

/** Patients as cards: contact details, and last / next visit in the footer. */
export function PatientCards({
  rows,
  onSelect,
}: {
  rows: Patient[];
  onSelect: (id: string) => void;
}) {
  const { data: upcoming } = useUpcomingVisits();
  return (
    <div className="product-cards patient-cards">
      {rows.map((p) => {
        const next = upcoming?.get(p.id);
        return (
          <article key={p.id} className={cn("product-card", !p.lastVisit && "patient-card-new")}>
            {/* The whole card, footer included, opens the patient's details. */}
            <button
              type="button"
              className="patient-card-button"
              onClick={() => onSelect(p.id)}
              aria-label={`Open ${p.name}`}
            >
              <div className="product-card-main">
                <div className="patient-card-head">
                  <span className="patient-card-avatar">{initials(p.name)}</span>
                  <div className="product-card-title min-w-0">
                    <strong>{p.name}</strong>
                    <small>
                      {[p.id, p.age != null && `${p.age} yrs`, p.gender]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                </div>
                <dl className="product-card-facts">
                  <div>
                    <dt>Concern</dt>
                    <dd className={cn(!p.concern && "text-muted-foreground")}>
                      {p.concern ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Treatment</dt>
                    <dd>{p.treatment}</dd>
                  </div>
                </dl>
                <ul className="patient-card-contact" aria-label="Contact details">
                  <li>
                    <Phone />
                    <span>{p.phone}</span>
                  </li>
                  <li className={cn(!p.email && "is-missing")}>
                    <Mail />
                    <span>{p.email ?? "No email"}</span>
                  </li>
                  <li className={cn("patient-card-address", !p.address && "is-missing")}>
                    <MapPin />
                    <span>{p.address ?? "No address"}</span>
                  </li>
                </ul>
              </div>
              <div className="product-card-foot patient-card-visits">
                <div>
                  <small>Last visit</small>
                  <strong>{formatVisit(p.lastVisit)}</strong>
                </div>
                <div>
                  <small>Upcoming</small>
                  {next ? (
                    <strong title={`${next.type} with ${next.doctor}`}>
                      {formatDay(clinicDateOf(next.startsAt))}, {clinicTimeOf(next.startsAt)}
                      <em>{next.type}</em>
                    </strong>
                  ) : (
                    <strong className="text-muted-foreground">Not booked</strong>
                  )}
                </div>
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}
