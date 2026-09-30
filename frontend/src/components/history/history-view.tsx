import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  ClipboardList,
  Droplet,
  FileSignature,
  RefreshCw,
  Search,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Banner, PageHeader, SectionHeader, StatusChip, type Tone } from "@/components/crm-ui";
import { initials } from "@/lib/mock-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { dateTime } from "./format";
import { useHistoryOverview, type ConsentState, type HistorySummary } from "./history-api";

type Filter = "all" | "safety" | "incomplete" | "consent";

const FILTERS: { id: Filter; label: string; test: (r: HistorySummary) => boolean }[] = [
  { id: "all", label: "All patients", test: () => true },
  {
    id: "safety",
    label: "Safety alerts",
    test: (r) =>
      r.allergies.length > 0 ||
      r.bleedingRisk.length > 0 ||
      r.infectious.length > 0 ||
      r.clearance === "Pending",
  },
  {
    id: "incomplete",
    label: "History not recorded",
    test: (r) => !r.medicalRecorded || !r.hairGrade,
  },
  { id: "consent", label: "No surgery consent", test: (r) => r.surgeryConsent !== "Signed" },
];

const CONSENT_TONE: Record<ConsentState, Tone> = {
  Signed: "success",
  Withdrawn: "error",
  Missing: "neutral",
};

type CellItem = { key: string; text: string; icon?: LucideIcon; tone?: Tone };

/**
 * One line: the first item, then "…+N" when there are more. Hover or focus shows
 * every item in a tooltip.
 */
function OneLine({ items, label }: { items: CellItem[]; label: string }) {
  const [first, ...rest] = items;
  if (!first) return null;
  const render = (item: CellItem) =>
    item.tone ? (
      <StatusChip tone={item.tone}>{item.text}</StatusChip>
    ) : (
      <span className="history-flag">
        {item.icon && <item.icon />}
        {item.text}
      </span>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="history-oneline"
          tabIndex={0}
          aria-label={`${label}: ${items.map((i) => i.text).join(", ")}`}
        >
          {render(first)}
          {rest.length > 0 && <span className="history-more">…+{rest.length}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="history-tooltip">
        <strong>{label}</strong>
        <ul>
          {items.map((i) => (
            <li key={i.key}>
              {i.icon && <i.icon />}
              {i.text}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function SafetyCell({ r }: { r: HistorySummary }) {
  if (!r.medicalRecorded && r.bleedingRisk.length === 0)
    return <span className="text-muted-foreground">Not recorded</span>;
  const items: CellItem[] = [
    ...r.allergies.map((a) => ({ key: `a-${a}`, text: `Allergy: ${a}`, icon: ShieldAlert })),
    ...r.bleedingRisk.map((d) => ({ key: `b-${d}`, text: `Bleeding risk: ${d}`, icon: Droplet })),
    ...r.infectious.map((c) => ({ key: `i-${c}`, text: `Infection: ${c}`, icon: AlertTriangle })),
    ...(r.clearance === "Pending"
      ? [{ key: "clearance", text: "Clearance pending", icon: AlertTriangle }]
      : []),
  ];
  if (items.length === 0) return <StatusChip tone="success">No alerts</StatusChip>;
  return <OneLine items={items} label="Safety alerts" />;
}

function ConsentCell({ r }: { r: HistorySummary }) {
  return (
    <OneLine
      label="Consent"
      items={[
        {
          key: "surgery",
          text: `Surgery · ${r.surgeryConsent}`,
          tone: CONSENT_TONE[r.surgeryConsent],
        },
        {
          key: "photos",
          text: `Photos · ${r.photoUse ?? r.photoConsent}`,
          tone: CONSENT_TONE[r.photoConsent],
        },
      ]}
    />
  );
}

/** Sidebar → History: every patient's record at a glance; a row opens the full history. */
export function HistoryView({ onOpen }: { onOpen: (patientId: string) => void }) {
  const { data, isPending, isError, refetch, isRefetching } = useHistoryOverview();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = data ?? [];
  const q = query.trim().toLowerCase();
  const active = FILTERS.find((f) => f.id === filter)!;
  const shown = rows
    .filter(active.test)
    .filter((r) => !q || `${r.patientName} ${r.patientId}`.toLowerCase().includes(q));
  const count = (f: Filter) => rows.filter(FILTERS.find((x) => x.id === f)!.test).length;

  return (
    <TooltipProvider delayDuration={150}>
      <PageHeader
        title="History"
        description="Medical baseline, hair assessment, photo vault and consent records for every patient"
      />

      <div className="metrics-grid">
        {[
          {
            label: "Records complete",
            value: rows.filter((r) => r.medicalRecorded && r.hairGrade).length,
            note: `of ${rows.length} patients`,
            icon: ClipboardList,
          },
          {
            label: "Safety alerts",
            value: count("safety"),
            note: "allergies, bleeding risk, infections",
            icon: ShieldAlert,
          },
          {
            label: "Photos in vault",
            value: rows.reduce((s, r) => s + r.photos, 0),
            note: `${rows.filter((r) => r.photos > 0).length} patients photographed`,
            icon: Camera,
          },
          {
            label: "Surgery consent on file",
            value: rows.filter((r) => r.surgeryConsent === "Signed").length,
            note: `${rows.filter((r) => r.photoConsent === "Signed").length} photo consents`,
            icon: FileSignature,
          },
        ].map((m) => (
          <article key={m.label} className="metric-card">
            <div className="metric-top">
              <span>{m.label}</span>
              <span className="metric-icon">
                <m.icon />
              </span>
            </div>
            <strong>{isPending ? "—" : m.value}</strong>
            <div className="metric-trend">
              <span className="billing-stat-note">{m.note}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="toolbar history-toolbar">
        <label className="field-search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or patient ID"
          />
        </label>
        <div className="segmented" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {data && f.id !== "all" && <small>{count(f.id)}</small>}
            </button>
          ))}
        </div>
      </div>

      <section className="panel">
        <SectionHeader
          title={data ? `${shown.length} patient${shown.length === 1 ? "" : "s"}` : "Patients"}
          subtitle="Click a patient to open their full history"
        />
        {isPending ? (
          <div className="table-loading">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="skeleton-row" key={i}>
                <Skeleton className="size-9" />
                <div>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
                <Skeleton className="ml-auto h-6 w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="table-error">
            <Banner tone="error">
              Couldn’t load patient histories. Make sure the backend is running.
            </Banner>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <Search />
            <h3>No patients match</h3>
            <p>Try a different name or filter.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Hair loss</th>
                  <th>Safety</th>
                  <th>Photos</th>
                  <th>Consent</th>
                  <th>Last updated</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.patientId} onClick={() => onOpen(r.patientId)}>
                    <td>
                      <div className="person">
                        <span>{initials(r.patientName)}</span>
                        <div>
                          <strong>{r.patientName}</strong>
                          <small>
                            {[r.patientId, r.age != null && `${r.age} yrs`, r.gender]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.hairGrade ? (
                        <strong>{r.hairGrade}</strong>
                      ) : (
                        <span className="text-muted-foreground">Not assessed</span>
                      )}
                    </td>
                    <td className={cn("history-safety-cell")}>
                      <SafetyCell r={r} />
                    </td>
                    <td>
                      {r.photos > 0 ? (
                        <>
                          <strong>{r.photos}</strong>
                          {r.latestMilestone && (
                            <small className="block">up to {r.latestMilestone}</small>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td>
                      <ConsentCell r={r} />
                    </td>
                    <td>{r.updatedAt ? dateTime(r.updatedAt) : "—"}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${r.patientName}'s history`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(r.patientId);
                        }}
                      >
                        <ChevronRight />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
