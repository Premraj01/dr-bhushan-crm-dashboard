import type { ReactNode } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { Banner } from "@/components/crm-ui";
import { errorText } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { dateTime, type Patch } from "./format";

/** A titled block inside a history form. */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="history-section">
      <header>
        <h4>{title}</h4>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** Editable list of rows: each row renders its own inputs, with a remove button. */
export function Rows<T>({
  items,
  onChange,
  blank,
  addLabel,
  empty,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  addLabel: string;
  empty: string;
  render: (item: T, update: (patch: Patch<T>) => void, index: number) => ReactNode;
}) {
  return (
    <div className="history-rows">
      {items.length === 0 && <p className="history-empty">{empty}</p>}
      {items.map((item, i) => (
        <div className="history-row" key={i}>
          <div className="history-row-fields">
            {render(
              item,
              (patch) => onChange(items.map((x, j) => (j === i ? ({ ...x, ...patch } as T) : x))),
              i,
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="history-row-remove"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, blank])}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}

/** One-click chips that add a common entry (hidden once it's in the list). */
export function QuickPicks({
  options,
  taken,
  onPick,
}: {
  options: readonly string[];
  taken: string[];
  onPick: (option: string) => void;
}) {
  const lower = new Set(taken.map((t) => t.trim().toLowerCase()));
  const left = options.filter((o) => !lower.has(o.toLowerCase()));
  if (left.length === 0) return null;
  return (
    <div className="quick-picks" aria-label="Quick add">
      {left.map((o) => (
        <button type="button" key={o} onClick={() => onPick(o)}>
          <Plus />
          {o}
        </button>
      ))}
    </div>
  );
}

/** Footer for a history form: who changed it last, errors, and Save. */
export function SaveBar({
  canEdit,
  dirty,
  isPending,
  error,
  edited,
  readOnlyNote,
}: {
  canEdit: boolean;
  dirty: boolean;
  isPending: boolean;
  error: unknown;
  edited?: { updatedBy: { name: string }; updatedAt: string } | undefined;
  readOnlyNote: string;
}) {
  return (
    <div className="history-save-bar">
      {error != null && <Banner tone="error">{errorText(error)}</Banner>}
      <div>
        <small>
          {edited
            ? `Last updated by ${edited.updatedBy.name} · ${dateTime(edited.updatedAt)}`
            : "Not recorded yet"}
        </small>
        {canEdit ? (
          <Button type="submit" disabled={!dirty || isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Saving…
              </>
            ) : dirty ? (
              "Save changes"
            ) : (
              "Saved"
            )}
          </Button>
        ) : (
          <small>{readOnlyNote}</small>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  action,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  action: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !isPending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending && <LoaderCircle className="animate-spin" />}
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
