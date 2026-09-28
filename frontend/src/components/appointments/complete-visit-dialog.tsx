import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, Minus, Pill, Plus, Search, X } from "lucide-react";
import { Banner } from "@/components/crm-ui";
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
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppointmentStatus, type Appointment } from "./appointments-api";

type Row = { item: InventoryItem; quantity: number };

/** Why a product can't be given right now, if it can't. */
function unavailable(item: InventoryItem, today: string): string | null {
  if (expiryState(item, today) === "expired") return "Expired";
  if (item.stockQuantity === 0) return "Out of stock";
  return null;
}

/**
 * "Mark completed", with the medicines the doctor recommended. They are taken out of
 * inventory and added to the visit's bill.
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
      <DialogContent className="sm:max-w-xl">
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
  const chosen = new Set(rows.map((r) => r.item.id));
  const matches = q
    ? (products ?? [])
        .filter(
          (p) =>
            !chosen.has(p.id) &&
            `${p.name} ${p.company} ${p.type} ${p.id}`.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];
  const total = rows.reduce((sum, r) => sum + r.item.sellingPrice * r.quantity, 0);

  const add = (item: InventoryItem) => {
    setRows((current) => [...current, { item, quantity: 1 }]);
    setSearch("");
  };
  const setQuantity = (id: string, quantity: number) =>
    setRows((current) =>
      current.map((r) =>
        r.item.id === id
          ? { ...r, quantity: Math.max(1, Math.min(r.item.stockQuantity, quantity || 1)) }
          : r,
      ),
    );

  const submit = (e: FormEvent) => {
    // This form is portalled out of the appointment form; keep its submit from reaching it.
    e.preventDefault();
    e.stopPropagation();
    complete.mutate(
      {
        id: appointment.id,
        medicines: rows.map((r) => ({ itemId: r.item.id, quantity: r.quantity })),
      },
      { onSuccess: (done) => onCompleted(done) },
    );
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Complete visit</DialogTitle>
        <DialogDescription>
          {appointment.patientName} · {appointment.type}. Add any medicines or products the doctor
          recommended — they’re taken out of inventory and added to this visit’s bill.
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
              // Enter adds the first available match instead of submitting.
              if (e.key !== "Enter") return;
              e.preventDefault();
              const first = matches.find((m) => !unavailable(m, today));
              if (first) add(first);
            }}
            placeholder={isPending ? "Loading inventory…" : "Search medicines and products"}
            aria-label="Search medicines and products"
          />
        </label>
        {isError && <Banner tone="error">Couldn’t load inventory.</Banner>}
        {q && (
          <ul className="medicine-results" role="listbox" aria-label="Matching products">
            {matches.length === 0 ? (
              <li className="medicine-empty">No products match “{search}”.</li>
            ) : (
              matches.map((item) => {
                const reason = unavailable(item, today);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={reason !== null}
                      onClick={() => add(item)}
                    >
                      <span className="min-w-0">
                        <strong>{item.name}</strong>
                        <small>
                          {item.company} · {item.type} · batch {item.batchNo}
                        </small>
                      </span>
                      <span className="medicine-result-meta">
                        <strong>{inrPrice.format(item.sellingPrice)}</strong>
                        <small className={cn(reason && "text-destructive")}>
                          {reason ?? `${item.stockQuantity} in stock`}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}

        {rows.length === 0 ? (
          <div className="medicine-none">
            <Pill />
            <p>No medicines added. You can complete the visit without any.</p>
          </div>
        ) : (
          <ul className="medicine-rows" aria-label="Medicines to give">
            {rows.map(({ item, quantity }) => (
              <li key={item.id}>
                <div className="min-w-0">
                  <strong>{item.name}</strong>
                  <small>
                    {inrPrice.format(item.sellingPrice)} each · {item.stockQuantity} in stock
                  </small>
                </div>
                <div className="qty-stepper">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`One less ${item.name}`}
                    disabled={quantity <= 1}
                    onClick={() => setQuantity(item.id, quantity - 1)}
                  >
                    <Minus />
                  </Button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={item.stockQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(item.id, Number(e.target.value))}
                    aria-label={`Quantity of ${item.name}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`One more ${item.name}`}
                    disabled={quantity >= item.stockQuantity}
                    onClick={() => setQuantity(item.id, quantity + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <b>{inrPrice.format(item.sellingPrice * quantity)}</b>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => setRows((current) => current.filter((r) => r.item.id !== item.id))}
                >
                  <X />
                </Button>
              </li>
            ))}
            <li className="medicine-total">
              <span>Medicines total</span>
              <b>{inrPrice.format(total)}</b>
            </li>
          </ul>
        )}

        {complete.error && (
          <Banner tone="error">
            {complete.error instanceof ApiError
              ? complete.error.message
              : "Couldn’t reach the clinic server. Make sure the backend is running."}
          </Banner>
        )}
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={complete.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={complete.isPending}>
          {complete.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
          {rows.length
            ? `Complete & give ${rows.length} item${rows.length > 1 ? "s" : ""}`
            : "Complete visit"}
        </Button>
      </DialogFooter>
    </form>
  );
}
