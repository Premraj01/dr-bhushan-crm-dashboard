import { CalendarCheck2, Package, Pill, Stethoscope } from "lucide-react";
import { Banner, StatusChip } from "@/components/crm-ui";
import { useCompletedVisits } from "@/components/appointments/appointments-api";
import { dosing } from "@/components/history/prescription-options";
import { Skeleton } from "@/components/ui/skeleton";
import { errorText } from "@/lib/api";
import { dateTime } from "./format";

/** Every completed appointment — surgery, PRP, consultations — newest first. */
export function VisitsTab({ patientId }: { patientId: string }) {
  const { data, isPending, isError, error } = useCompletedVisits(patientId);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (isError) return <Banner tone="error">{errorText(error)}</Banner>;
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <CalendarCheck2 />
        <h3>No completed visits yet</h3>
        <p>Visits appear here once they are marked completed in the calendar.</p>
      </div>
    );
  }

  return (
    <div className="rx-list">
      {data.map((a) => (
        <article key={a.id}>
          <header>
            <div className="min-w-0">
              <strong>{a.type}</strong>
              <small>
                {dateTime(a.startsAt)}
                {a.days && a.days > 1 ? ` · ${a.days} days` : ""} · {a.doctor} · {a.id}
              </small>
            </div>
            {a.packageId ? (
              <StatusChip tone="info">
                {a.packageId}
                {a.packageStep != null ? ` · visit ${a.packageStep + 1}` : ""}
              </StatusChip>
            ) : (
              <StatusChip tone="success">Completed</StatusChip>
            )}
          </header>
          {!!(a.medicines?.length || a.prescription?.length) && (
            <ul>
              {a.medicines?.map((m) => (
                <li key={`given-${m.itemId}`}>
                  <Package />
                  <div className="min-w-0">
                    <strong>{m.name}</strong>
                    <small>Given from stock · batch {m.batchNo}</small>
                  </div>
                  <StatusChip tone="info">× {m.quantity}</StatusChip>
                </li>
              ))}
              {a.prescription?.map((p, i) => (
                <li key={`rx-${p.name}-${i}`}>
                  <Pill />
                  <div className="min-w-0">
                    <strong>{p.name}</strong>
                    <small>{["Prescribed", dosing(p)].filter(Boolean).join(" · ")}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {a.notes && (
            <p className="rx-notes">
              <Stethoscope className="mr-1 inline size-3.5 align-[-2px]" />
              {a.notes}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
