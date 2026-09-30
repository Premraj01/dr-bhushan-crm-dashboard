import { useState, type FormEvent } from "react";
import { ClipboardList, Droplet, LoaderCircle, Pill, Plus, Square, X } from "lucide-react";
import { Banner, StatusChip } from "@/components/crm-ui";
import { useInventory } from "@/components/inventory/inventory-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorText } from "@/lib/api";
import { dateTime, longDate } from "./format";
import {
  useCreatePrescription,
  usePrescriptions,
  useStopPrescription,
  type Prescription,
} from "./history-api";
import {
  blankRx,
  COMMON_PRESCRIPTIONS,
  dosing,
  toPrescribed,
  type RxDraft,
} from "./prescription-options";
import { RxFields } from "./rx-fields";
import { ConfirmDialog } from "./shared";

function status(p: Prescription): { text: string; tone: "success" | "neutral" | "error" } {
  if (p.stoppedAt) return { text: `Stopped ${longDate(p.stoppedAt)}`, tone: "error" };
  if (p.active)
    return {
      text: p.endsOn ? `Active · until ${longDate(p.endsOn)}` : "Active · ongoing",
      tone: "success",
    };
  return { text: `Course finished ${p.endsOn ? longDate(p.endsOn) : ""}`, tone: "neutral" };
}

/** Every prescription: written when a visit is completed, or here by a doctor. */
export function PrescriptionsTab({
  patientId,
  canPrescribe,
  onNotice,
}: {
  patientId: string;
  canPrescribe: boolean;
  onNotice: (message: string) => void;
}) {
  const { data, isPending, isError, error } = usePrescriptions(patientId);
  const stop = useStopPrescription(patientId);
  const [adding, setAdding] = useState(false);
  const [stopping, setStopping] = useState<Prescription | null>(null);

  return (
    <div className="documents-tab">
      <div className="vault-toolbar">
        <p className="field-note m-0">
          Medicines prescribed when a visit is completed are recorded here automatically.
        </p>
        {canPrescribe && (
          <Button
            size="sm"
            variant={adding ? "outline" : "default"}
            onClick={() => setAdding((a) => !a)}
          >
            {adding ? <X /> : <Plus />}
            {adding ? "Close" : "New prescription"}
          </Button>
        )}
      </div>

      {adding && (
        <NewPrescription
          patientId={patientId}
          onDone={() => {
            setAdding(false);
            onNotice("Prescription saved to the history.");
          }}
        />
      )}
      {stop.isError && <Banner tone="error">{errorText(stop.error)}</Banner>}

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <Banner tone="error">{errorText(error)}</Banner>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <ClipboardList />
          <h3>No prescriptions yet</h3>
          <p>They appear here when the doctor prescribes at “Complete visit”.</p>
        </div>
      ) : (
        <div className="rx-list">
          {data.map((p) => {
            const s = status(p);
            return (
              <article key={p.id} className={p.active ? undefined : "inactive"}>
                <header>
                  <div className="min-w-0">
                    <strong>{p.visit ?? "Prescribed outside a visit"}</strong>
                    <small>
                      {dateTime(p.prescribedAt)} · {p.prescribedBy} · {p.id}
                    </small>
                  </div>
                  <StatusChip tone={s.tone}>{s.text}</StatusChip>
                </header>
                <ul>
                  {p.items.map((i, n) => (
                    <li key={`${i.name}-${n}`}>
                      <Pill />
                      <div className="min-w-0">
                        <strong>
                          {i.name}
                          {i.affectsBleeding && (
                            <span className="rx-flag" title="Affects bleeding">
                              <Droplet /> affects bleeding
                            </span>
                          )}
                        </strong>
                        <small>{dosing(i)}</small>
                        {i.instructions && <small>{i.instructions}</small>}
                      </div>
                      {i.dispensed ? (
                        <StatusChip tone="info">Given × {i.dispensed}</StatusChip>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {p.notes && <p className="rx-notes">{p.notes}</p>}
                {p.stoppedBy && <small className="rx-stopped">Stopped by {p.stoppedBy}</small>}
                {canPrescribe && p.active && (
                  <footer>
                    <Button size="sm" variant="ghost" onClick={() => setStopping(p)}>
                      <Square />
                      Stop medicines
                    </Button>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={stopping !== null}
        title="Stop this prescription?"
        description="The patient should stop taking these medicines now. The prescription stays in the history, marked as stopped."
        action="Stop medicines"
        isPending={stop.isPending}
        onCancel={() => setStopping(null)}
        onConfirm={() =>
          stop.mutate(stopping!.id, {
            onSuccess: () => {
              setStopping(null);
              onNotice("Prescription stopped.");
            },
            onError: () => setStopping(null),
          })
        }
      />
    </div>
  );
}

function NewPrescription({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const create = useCreatePrescription(patientId);
  const { data: products } = useInventory();
  const [rows, setRows] = useState<RxDraft[]>([blankRx("")]);
  const [notes, setNotes] = useState("");
  const names = [...new Set([...COMMON_PRESCRIPTIONS, ...(products ?? []).map((p) => p.name)])];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const items = rows.filter((r) => r.name.trim()).map(toPrescribed);
    if (!items.length) return;
    create.mutate({ items, ...(notes.trim() && { notes: notes.trim() }) }, { onSuccess: onDone });
  };

  return (
    <form className="photo-upload" onSubmit={submit}>
      <fieldset className="form-lock" disabled={create.isPending}>
        <ul className="rx-rows">
          {rows.map((row, i) => (
            <li key={i}>
              <header>
                <label className="rx-name">
                  Medicine
                  <input
                    required
                    maxLength={120}
                    list="rx-name-options"
                    value={row.name}
                    onChange={(e) =>
                      setRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    placeholder="e.g. Finasteride 1 mg"
                  />
                </label>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove medicine"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                )}
              </header>
              <RxFields
                idPrefix={`new-rx-${i}`}
                value={row}
                onChange={(patch) =>
                  setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                }
              />
            </li>
          ))}
        </ul>
        <datalist id="rx-name-options">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRows((r) => [...r, blankRx("")])}
          >
            <Plus />
            Add medicine
          </Button>
        </div>
        <label className="package-notes-field">
          Notes
          <input
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — e.g. refill after teleconsultation"
          />
        </label>
      </fieldset>
      {create.isError && <Banner tone="error">{errorText(create.error)}</Banner>}
      <div className="photo-upload-actions">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <LoaderCircle className="animate-spin" /> : <ClipboardList />}
          Save prescription
        </Button>
      </div>
    </form>
  );
}
