import { useState, type FormEvent } from "react";
import { Check, ClipboardList, LoaderCircle, Minus, Pill, Plus, Search, X } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { RxFields } from "@/components/history/rx-fields";
import {
  blankRx,
  COMMON_PRESCRIPTIONS,
  toPrescribed,
  type RxDraft,
} from "@/components/history/prescription-options";
import {
  expiryState,
  inrPrice,
  useInventory,
  type InventoryItem,
} from "@/components/inventory/inventory-api";
import { clinicToday } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppointmentStatus, type Appointment } from "./appointments-api";
import { ValidatedForm } from "@/components/form/validated-form";

/**
 * One prescribed medicine. `item` is set for products the clinic stocks; `give` is how
 * many are handed over now from stock (0 = the patient buys it elsewhere).
 */
type Row = { key: number; rx: RxDraft; item?: InventoryItem; give: number };

/** Why a product can't be given right now, if it can't. */
function unavailable(item: InventoryItem, today: string): string | null {
  if (expiryState(item, today) === "expired") return "Expired";
  if (item.stockQuantity === 0) return "Out of stock";
  return null;
}

/**
 * "Mark completed", with what the doctor prescribed. The prescription is recorded in
 * the patient's history; medicines given from clinic stock are taken out of inventory
 * and added to the visit's bill.
 */
export function CompleteVisitDialog({
  appointment,
  open,
  onOpenChange,
  onCompleted,
}: {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (appointment: Appointment) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="complete-visit-dialog">
        {open && (
          <CompleteVisitForm
            appointment={appointment}
            onCancel={() => onOpenChange(false)}
            onCompleted={onCompleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

let nextKey = 1;

function CompleteVisitForm({
  appointment,
  onCancel,
  onCompleted,
}: {
  appointment: Appointment;
  onCancel: () => void;
  onCompleted: (appointment: Appointment) => void;
}) {
  const today = clinicToday();
  const { data: products, isPending, isError } = useInventory();
  const { complete } = useAppointmentStatus();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const chosenItems = new Set(rows.map((r) => r.item?.id).filter(Boolean));
  const chosenNames = new Set(rows.map((r) => r.rx.name.toLowerCase()));
  const stockMatches = q
    ? (products ?? [])
        .filter(
          (p) =>
            !chosenItems.has(p.id) &&
            `${p.name} ${p.company} ${p.type} ${p.id}`.toLowerCase().includes(q),
        )
        .slice(0, 5)
    : [];
  const otherMatches = q
    ? COMMON_PRESCRIPTIONS.filter(
        (n) => n.toLowerCase().includes(q) && !chosenNames.has(n.toLowerCase()),
      ).slice(0, 3)
    : [];
  const exact = [...stockMatches.map((p) => p.name), ...otherMatches].some(
    (n) => n.toLowerCase() === q,
  );
  const given = rows.filter((r) => r.item && r.give > 0);
  const total = given.reduce((sum, r) => sum + r.item!.sellingPrice * r.give, 0);

  const addStock = (item: InventoryItem) => {
    setRows((current) => [
      ...current,
      {
        key: nextKey++,
        rx: blankRx(item.name, item.id),
        item,
        give: unavailable(item, today) ? 0 : 1,
      },
    ]);
    setSearch("");
  };
  const addOther = (name: string) => {
    setRows((current) => [...current, { key: nextKey++, rx: blankRx(name), give: 0 }]);
    setSearch("");
  };
  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setGive = (row: Row, give: number) =>
    update(row.key, {
      give: Math.max(0, Math.min(row.item?.stockQuantity ?? 0, Number.isFinite(give) ? give : 0)),
    });

  const submit = (e: FormEvent) => {
    // This form is portalled out of the appointment form; keep its submit from reaching it.
    e.preventDefault();
    e.stopPropagation();
    complete.mutate(
      {
        id: appointment.id,
        medicines: given.map((r) => ({ itemId: r.item!.id, quantity: r.give })),
        prescription: rows.map((r) => toPrescribed(r.rx)),
      },
      { onSuccess: (done) => onCompleted(done) },
    );
  };

  return (
    <ValidatedForm onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Complete visit & prescribe</DialogTitle>
        <DialogDescription>
          {appointment.patientName} · {appointment.type}.{" "}
          {appointment.patientId
            ? "The prescription is saved to the patient’s history."
            : "Walk-in without a patient record: the prescription is kept on this visit only."}{" "}
          Medicines given from clinic stock are added to this visit’s bill.
        </DialogDescription>
      </DialogHeader>

      <div className="complete-visit mt-4">
        <label className="field-search complete-visit-search">
          <Search />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the first match (or the typed name) instead of submitting.
              if (e.key !== "Enter") return;
              e.preventDefault();
              const first = stockMatches[0];
              if (first) addStock(first);
              else if (otherMatches[0]) addOther(otherMatches[0]);
              else if (q) addOther(search.trim());
            }}
            placeholder={
              isPending ? "Loading inventory…" : "Search clinic stock or type any medicine"
            }
            aria-label="Search or type a medicine"
          />
        </label>
        {isError && (
          <Banner tone="error">Couldn’t load inventory — you can still type medicines.</Banner>
        )}
        {q && (
          <ul className="medicine-results" role="listbox" aria-label="Matching medicines">
            {stockMatches.map((item) => {
              const reason = unavailable(item, today);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => addStock(item)}
                  >
                    <span className="min-w-0">
                      <strong>{item.name}</strong>
                      <small>
                        Clinic stock · {item.company} · batch {item.batchNo}
                      </small>
                    </span>
                    <span className="medicine-result-meta">
                      <strong>{inrPrice.format(item.sellingPrice)}</strong>
                      <small className={cn(reason && "text-destructive")}>
                        {reason ? `${reason} — prescribe only` : `${item.stockQuantity} in stock`}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
            {otherMatches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => addOther(name)}
                >
                  <span className="min-w-0">
                    <strong>{name}</strong>
                    <small>Not stocked — patient buys it from a pharmacy</small>
                  </span>
                </button>
              </li>
            ))}
            {!exact && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => addOther(search.trim())}
                >
                  <span className="min-w-0">
                    <strong>
                      <Plus className="inline size-3" /> Prescribe “{search.trim()}”
                    </strong>
                    <small>Any medicine not in clinic stock</small>
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}

        {rows.length === 0 ? (
          <div className="medicine-none">
            <Pill />
            <p>Nothing prescribed. You can complete the visit without any medicines.</p>
          </div>
        ) : (
          <ul className="rx-rows" aria-label="Prescription">
            {rows.map((row) => {
              const reason = row.item ? unavailable(row.item, today) : null;
              return (
                <li key={row.key}>
                  <header>
                    <div className="min-w-0">
                      <strong>{row.rx.name}</strong>
                      <small>
                        {row.item
                          ? `Clinic stock · ${inrPrice.format(row.item.sellingPrice)} each · ${row.item.stockQuantity} in stock`
                          : "Patient buys it from a pharmacy"}
                      </small>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.rx.name}`}
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    >
                      <X />
                    </Button>
                  </header>
                  <RxFields
                    idPrefix={`rx-${row.key}`}
                    value={row.rx}
                    onChange={(patch) => update(row.key, { rx: { ...row.rx, ...patch } })}
                  />
                  {row.item && (
                    <div className="rx-give">
                      <span>
                        {reason
                          ? `${reason} — can’t give from stock`
                          : "Give now from clinic stock"}
                      </span>
                      {!reason && (
                        <div className="qty-stepper">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`One less ${row.rx.name}`}
                            disabled={row.give <= 0}
                            onClick={() => setGive(row, row.give - 1)}
                          >
                            <Minus />
                          </Button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={row.item.stockQuantity}
                            value={row.give}
                            onChange={(e) => setGive(row, Number(e.target.value))}
                            aria-label={`Quantity of ${row.rx.name} to give`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`One more ${row.rx.name}`}
                            disabled={row.give >= row.item.stockQuantity}
                            onClick={() => setGive(row, row.give + 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                      )}
                      <b>
                        {row.give > 0 ? inrPrice.format(row.item.sellingPrice * row.give) : "—"}
                      </b>
                    </div>
                  )}
                </li>
              );
            })}
            {given.length > 0 && (
              <li className="medicine-total">
                <span>Given from stock (added to the bill)</span>
                <b>{inrPrice.format(total)}</b>
              </li>
            )}
          </ul>
        )}

        {complete.error && <Banner tone="error">{errorText(complete.error)}</Banner>}
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={complete.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={complete.isPending}>
          {complete.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : rows.length ? (
            <ClipboardList />
          ) : (
            <Check />
          )}
          {rows.length
            ? `Complete & prescribe ${rows.length} medicine${rows.length > 1 ? "s" : ""}`
            : "Complete visit"}
        </Button>
      </DialogFooter>
    </ValidatedForm>
  );
}
