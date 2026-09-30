import { useState, type FormEvent } from "react";
import {
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Banner, SectionHeader, StatusChip } from "@/components/crm-ui";
import { clinicToday } from "@/components/patients/patients-api";
import { inr, useCatalog, type TreatmentOption } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/lib/use-debounced";
import { PlanItemsEditor, PlanPreview } from "./plan-editor";
import {
  planSummary,
  usePlanMutations,
  usePlans,
  useQuote,
  visitCount,
  type PlanItem,
  type TreatmentPlan,
} from "./plans-api";
import { ValidatedForm } from "@/components/form/validated-form";

const errorText = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Couldn’t reach the clinic server. Make sure the backend is running.";

/** Settings → Treatment plans: reusable combinations of treatments with gaps between them. */
export function PlansSettingsPanel({
  editing,
  onEditingChange,
  onNotice,
}: {
  /** "new", a plan being edited, or null. */
  editing: "new" | TreatmentPlan | null;
  onEditingChange: (editing: "new" | TreatmentPlan | null) => void;
  onNotice: (message: string) => void;
}) {
  const { data, isPending, isError, error, refetch, isRefetching } = usePlans();
  const { data: treatments } = useCatalog<TreatmentOption>("treatments");
  const { save, remove } = usePlanMutations();
  const [actionError, setActionError] = useState<string | null>(null);
  const nameOf = (id: string) => treatments?.find((t) => t.id === id)?.name ?? "Unknown";

  return (
    <section className="panel">
      <SectionHeader
        title="Treatment plans"
        subtitle="Combinations of treatments in order, with the gap between visits"
      />
      <div className="catalog-body">
        {actionError && (
          <Banner tone="error" onClose={() => setActionError(null)}>
            {actionError}
          </Banner>
        )}
        {isPending ? (
          <div className="catalog-list">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="table-error">
            <Banner tone="error">{errorText(error)}</Banner>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
              Try again
            </Button>
          </div>
        ) : data.length === 0 ? (
          <div className="empty-state">
            <ListOrdered />
            <h3>No plans yet</h3>
            <p>
              Create a plan once — e.g. PRP with two derma roller sessions — and apply it to
              patients.
            </p>
          </div>
        ) : (
          <ul className="catalog-list">
            {data.map((plan) => (
              <li key={plan.id} className={cn("catalog-row plan-row", !plan.active && "inactive")}>
                <span className="catalog-icon">
                  <ListOrdered />
                </span>
                <div className="min-w-0">
                  <strong>
                    {plan.name}
                    {!plan.active && <StatusChip tone="neutral">Inactive</StatusChip>}
                  </strong>
                  <small>
                    {visitCount(plan.items)} visits · {planSummary(plan.items, nameOf)}
                    {plan.description && ` — ${plan.description}`}
                  </small>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${plan.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditingChange(plan)}>
                      <Pencil />
                      Edit plan
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        save.mutate(
                          { id: plan.id, body: { active: !plan.active } },
                          {
                            onSuccess: () =>
                              onNotice(
                                `“${plan.name}” ${plan.active ? "deactivated" : "activated"}.`,
                              ),
                            onError: (e) => setActionError(errorText(e)),
                          },
                        )
                      }
                    >
                      <Power />
                      {plan.active ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() =>
                        remove.mutate(plan.id, {
                          onSuccess: () => onNotice(`“${plan.name}” deleted.`),
                          onError: (e) => setActionError(errorText(e)),
                        })
                      }
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && onEditingChange(null)}>
        <DialogContent className="plan-dialog">
          {editing !== null && (
            <PlanForm
              key={editing === "new" ? "new" : editing.id}
              plan={editing === "new" ? undefined : editing}
              treatments={(treatments ?? []).filter((t) => t.active)}
              onDone={(message) => {
                onEditingChange(null);
                onNotice(message);
              }}
              onCancel={() => onEditingChange(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PlanForm({
  plan,
  treatments,
  onDone,
  onCancel,
}: {
  plan?: TreatmentPlan | undefined;
  treatments: TreatmentOption[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { save } = usePlanMutations();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [items, setItems] = useState<PlanItem[]>(plan?.items ?? []);
  const preview = useDebounced(items, 350);
  const quote = useQuote(preview.length ? { items: preview, startDate: clinicToday() } : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        id: plan?.id,
        body: { name: name.trim(), description: description.trim(), items },
      },
      {
        onSuccess: (saved) =>
          onDone(plan ? `“${saved.name}” updated.` : `“${saved.name}” added to treatment plans.`),
      },
    );
  };

  return (
    <ValidatedForm onSubmit={submit} className="plan-form">
      <DialogHeader>
        <DialogTitle>{plan ? "Edit treatment plan" : "New treatment plan"}</DialogTitle>
        <DialogDescription>
          Put the treatments in order and set the gap before each visit. Use a repeat block for
          cycles such as PRP → roller → roller.
        </DialogDescription>
      </DialogHeader>
      <div className="plan-form-body">
        <div className="plan-form-main">
          <div className="form-grid">
            <label className="full">
              Plan name
              <input
                required
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PRP with derma roller"
              />
            </label>
            <label className="full">
              Description
              <input
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — who it’s for"
              />
            </label>
          </div>
          <PlanItemsEditor items={items} onChange={setItems} treatments={treatments} />
        </div>
        <aside className="plan-form-side">
          <h4 className="billing-heading">Preview from today</h4>
          {items.length ? (
            <PlanPreview
              quote={quote.data}
              isPending={quote.isFetching}
              error={quote.error}
              showPrices
            />
          ) : (
            <p className="package-empty">Add a step to see the visits.</p>
          )}
          {quote.data && (
            <p className="plan-total">
              At Settings prices: <strong>{inr.format(quote.data.total)}</strong>
            </p>
          )}
        </aside>
      </div>
      {save.isError && <Banner tone="error">{errorText(save.error)}</Banner>}
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || items.length === 0 || save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {plan ? "Save plan" : "Create plan"}
        </Button>
      </DialogFooter>
    </ValidatedForm>
  );
}
