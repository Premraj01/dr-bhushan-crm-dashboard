import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarX2,
  IndianRupee,
  LayoutGrid,
  LoaderCircle,
  Minus,
  MoreHorizontal,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { Banner, PageHeader, SectionHeader, StatusChip } from "@/components/crm-ui";
import { clinicToday, formatDay } from "@/components/patients/patients-api";
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
import {
  EXPIRY_WARNING_DAYS,
  PRODUCT_TYPES,
  expiryState,
  inrPrice,
  stockState,
  useInventory,
  useInventoryMutations,
  type InventoryItem,
  type ProductType,
} from "./inventory-api";
import { DateInput } from "@/components/form/date-input";
import { ValidatedForm } from "@/components/form/validated-form";
import { SelectInput } from "@/components/form/select-input";
import { useCan } from "@/lib/use-permissions";

type Filter = "all" | "attention" | "low" | "out" | "soon" | "expired";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All stock" },
  { value: "attention", label: "Needs attention" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "soon", label: `Expiring in ${EXPIRY_WARNING_DAYS} days` },
  { value: "expired", label: "Expired" },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session isn’t connected to the clinic server. Sign in again with the backend running.";
    if (error.status === 403) return "Only Super Admins can delete products.";
    return error.message;
  }
  return "Couldn’t reach the clinic server. Make sure the backend is running.";
}

function matches(item: InventoryItem, filter: Filter, today: string): boolean {
  const stock = stockState(item);
  const expiry = expiryState(item, today);
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return stock !== "ok" || expiry !== "ok";
    case "low":
      return stock === "low";
    case "out":
      return stock === "out";
    case "soon":
      return expiry === "soon";
    case "expired":
      return expiry === "expired";
  }
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "warning" | "error" | undefined;
}) {
  return (
    <article className={cn("metric-card billing-stat", tone && `billing-stat-${tone}`)}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-trend">
        <span className="billing-stat-note">{note}</span>
      </div>
    </article>
  );
}

/** Product photo, or a box icon when there's none or it fails to load. */
function ProductThumb({ item }: { item: Pick<InventoryItem, "imageUrl" | "name"> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  return (
    <span className="product-thumb">
      {item.imageUrl && !failed ? (
        <img src={item.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Package aria-hidden />
      )}
    </span>
  );
}

function StockChip({ item }: { item: InventoryItem }) {
  const state = stockState(item);
  if (state === "out") return <StatusChip tone="error">Out of stock</StatusChip>;
  if (state === "low") return <StatusChip tone="warning">Low stock</StatusChip>;
  return <StatusChip tone="success">In stock</StatusChip>;
}

function ExpiryChip({ item, today }: { item: InventoryItem; today: string }) {
  const state = expiryState(item, today);
  if (state === "expired") return <StatusChip tone="error">Expired</StatusChip>;
  if (state === "soon") return <StatusChip tone="warning">Expires soon</StatusChip>;
  return null;
}

type Layout = "table" | "cards";
const LAYOUT_KEY = "drb-inventory-layout";

/** The last layout picked on this device; storage can be unavailable (private mode). */
function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

export function InventoryView({ onNotice }: { onNotice: (message: string) => void }) {
  const canDelete = useCan("inventory", "delete");
  const today = clinicToday();
  const { data, isPending, isError, error, refetch, isRefetching } = useInventory();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [layout, setLayoutState] = useState<Layout>(savedLayout);
  const { remove } = useInventoryMutations();

  const setLayout = (next: Layout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Not remembered; the choice still applies for this visit.
    }
  };

  const items = data ?? [];
  const q = search.trim().toLowerCase();
  const rows = items.filter(
    (item) =>
      (!type || item.type === type) &&
      matches(item, filter, today) &&
      (!q || `${item.name} ${item.id} ${item.company} ${item.batchNo}`.toLowerCase().includes(q)),
  );

  const lowCount = items.filter((i) => stockState(i) === "low").length;
  const outCount = items.filter((i) => stockState(i) === "out").length;
  const soonCount = items.filter((i) => expiryState(i, today) === "soon").length;
  const expiredCount = items.filter((i) => expiryState(i, today) === "expired").length;
  const costValue = items.reduce((sum, i) => sum + i.costPrice * i.stockQuantity, 0);
  const retailValue = items.reduce((sum, i) => sum + i.sellingPrice * i.stockQuantity, 0);
  const units = items.reduce((sum, i) => sum + i.stockQuantity, 0);

  const actionsMenu = (item: InventoryItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setAdjusting(item)}>
          <PackagePlus />
          Adjust stock
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditing(item)}>
          <Pencil />
          Edit product
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setPendingDelete(item)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setActionError(null);
    remove.mutate(item.id, {
      onSuccess: () => onNotice(`“${item.name}” removed from inventory.`),
      onError: (err) => setActionError(errorMessage(err)),
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Medicines, shampoos, oils and other products — stock, batches and expiry"
        action="Add product"
        onAction={() => setEditing("new")}
      />
      {actionError && (
        <Banner tone="error" onClose={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}
      <div className="metrics-grid">
        {!data ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] w-full" />)
        ) : (
          <>
            <StatCard
              label="Products"
              value={items.length.toLocaleString("en-IN")}
              note={`${units.toLocaleString("en-IN")} units on hand`}
              icon={Package}
            />
            <StatCard
              label="Stock value (cost)"
              value={inrPrice.format(Math.round(costValue))}
              note={`${inrPrice.format(Math.round(retailValue))} at selling price`}
              icon={IndianRupee}
            />
            <StatCard
              label="Low / out of stock"
              value={String(lowCount + outCount)}
              note={`${lowCount} low · ${outCount} out — reorder`}
              icon={AlertTriangle}
              tone={outCount ? "error" : lowCount ? "warning" : undefined}
            />
            <StatCard
              label="Expiry alerts"
              value={String(soonCount + expiredCount)}
              note={`${expiredCount} expired · ${soonCount} within ${EXPIRY_WARNING_DAYS} days`}
              icon={CalendarX2}
              tone={expiredCount ? "error" : soonCount ? "warning" : undefined}
            />
          </>
        )}
      </div>
      <div className="toolbar">
        <label className="field-search">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, company or batch"
            aria-label="Search inventory"
          />
        </label>
        <SelectInput
          className="toolbar-select"
          value={type}
          onChange={(e) => setType(e.target.value as ProductType | "")}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </SelectInput>
        <SelectInput
          className="toolbar-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Filter by stock status"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectInput>
      </div>
      <section className="panel">
        <SectionHeader
          title={data ? `${rows.length} of ${items.length} products` : "Products"}
          subtitle="Use Adjust stock to record a restock or a sale"
          trailing={
            <div className="layout-toggle" role="radiogroup" aria-label="Layout">
              {(
                [
                  ["table", "Table", Table2],
                  ["cards", "Cards", LayoutGrid],
                ] as const
              ).map(([value, label, Icon]) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  role="radio"
                  aria-checked={layout === value}
                  className={cn(layout === value && "is-active")}
                  onClick={() => setLayout(value)}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          }
        />
        {isPending ? (
          <div className="table-loading" aria-label="Loading inventory">
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
            <Banner tone="error">{errorMessage(error)}</Banner>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {items.length ? <Search /> : <Package />}
            <h3>{items.length ? "No products match" : "No products yet"}</h3>
            <p>
              {items.length
                ? "Try a different search or filter."
                : "Add the medicines, shampoos and other products you stock."}
            </p>
          </div>
        ) : layout === "cards" ? (
          <div className="product-cards">
            {rows.map((item) => (
              <article
                key={item.id}
                className={cn("product-card", `product-card-${stockState(item)}`)}
              >
                <button
                  type="button"
                  className="product-card-main"
                  onClick={() => setEditing(item)}
                  aria-label={`Edit ${item.name}`}
                >
                  <div className="product-card-art">
                    <ProductThumb item={item} />
                  </div>
                  <div className="product-card-title">
                    <div className="product-card-name">
                      <strong>{item.name}</strong>
                      <StockChip item={item} />
                    </div>
                    <small>
                      {item.company} · {item.type}
                    </small>
                  </div>
                  <dl className="product-card-facts">
                    <div>
                      <dt>Stock</dt>
                      <dd>
                        <strong>{item.stockQuantity.toLocaleString("en-IN")}</strong>
                        <small> / reorder at {item.reorderLevel}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Selling</dt>
                      <dd>
                        <strong>{inrPrice.format(item.sellingPrice)}</strong>
                        <small> cost {inrPrice.format(item.costPrice)}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Batch</dt>
                      <dd>{item.batchNo}</dd>
                    </div>
                    <div>
                      <dt>Expiry</dt>
                      <dd>{formatDay(item.expiryDate)}</dd>
                    </div>
                  </dl>
                </button>
                <div className="product-card-foot">
                  <small className="product-card-sku">SKU {item.id}</small>
                  <div className="product-card-chips">
                    <ExpiryChip item={item} today={today} />
                  </div>
                  {actionsMenu(item)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className="num">Stock</th>
                  <th>Stock status</th>
                  <th className="num">Cost</th>
                  <th className="num">Selling</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} onClick={() => setEditing(item)}>
                    <td>
                      <div className="person">
                        <ProductThumb item={item} />
                        <div>
                          <strong>{item.name}</strong>
                          <small>SKU {item.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>{item.company}</td>
                    <td>{item.type}</td>
                    <td>{item.batchNo}</td>
                    <td>
                      <div className="inventory-cell">
                        <span>{formatDay(item.expiryDate)}</span>
                        <ExpiryChip item={item} today={today} />
                      </div>
                    </td>
                    <td className="num">
                      <div className="inventory-cell inventory-cell-end">
                        <strong>{item.stockQuantity.toLocaleString("en-IN")}</strong>
                        <small>reorder at {item.reorderLevel}</small>
                      </div>
                    </td>
                    <td>
                      <StockChip item={item} />
                    </td>
                    <td className="num">{inrPrice.format(item.costPrice)}</td>
                    <td className="num">
                      <strong>{inrPrice.format(item.sellingPrice)}</strong>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>{actionsMenu(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          {editing !== null && (
            <ProductForm
              item={editing === "new" ? undefined : editing}
              onCancel={() => setEditing(null)}
              onDone={(message) => {
                setEditing(null);
                onNotice(message);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={adjusting !== null} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent className="sm:max-w-md">
          {adjusting && (
            <AdjustStockForm
              item={adjusting}
              onCancel={() => setAdjusting(null)}
              onDone={(message) => {
                setAdjusting(null);
                onNotice(message);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !remove.isPending && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              SKU {pendingDelete?.id} and its stock count will be removed from inventory. This can’t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {remove.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------- add / edit ---------- */

function ProductForm({
  item,
  onDone,
  onCancel,
}: {
  item?: InventoryItem | undefined;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { create, update } = useInventoryMutations();
  const save = item ? update : create;
  const [itemId, setItemId] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [company, setCompany] = useState(item?.company ?? "");
  const [type, setType] = useState<ProductType>(item?.type ?? "Tablet");
  const [stockQuantity, setStockQuantity] = useState(item ? String(item.stockQuantity) : "");
  const [reorderLevel, setReorderLevel] = useState(item ? String(item.reorderLevel) : "10");
  const [costPrice, setCostPrice] = useState(item ? String(item.costPrice) : "");
  const [sellingPrice, setSellingPrice] = useState(item ? String(item.sellingPrice) : "");
  const [batchNo, setBatchNo] = useState(item?.batchNo ?? "");
  const [expiryDate, setExpiryDate] = useState(item?.expiryDate ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const belowCost =
    costPrice !== "" && sellingPrice !== "" && Number(sellingPrice) < Number(costPrice);

  const [errorEl, setErrorEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (save.isError) errorEl?.focus();
  }, [save.isError, errorEl]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      company: company.trim(),
      type,
      stockQuantity: Number(stockQuantity),
      reorderLevel: Number(reorderLevel),
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      batchNo: batchNo.trim(),
      expiryDate,
      // null clears a previous image when editing.
      imageUrl: imageUrl.trim() || null,
    };
    const onSuccess = (saved: InventoryItem) =>
      onDone(item ? `“${saved.name}” updated.` : `“${saved.name}” added to inventory.`);
    if (item) update.mutate({ id: item.id, body }, { onSuccess });
    else create.mutate({ ...body, itemId: itemId.trim() }, { onSuccess });
  };

  return (
    <ValidatedForm onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{item ? "Edit product" : "Add product"}</DialogTitle>
        <DialogDescription>
          {item
            ? "The SKU can’t be changed. Use Adjust stock to record a restock or sale."
            : "Scan or type the barcode as the SKU. It identifies the product and can’t be changed later."}
        </DialogDescription>
      </DialogHeader>
      {save.isError && (
        <div ref={setErrorEl} tabIndex={-1} className="mt-4 outline-none">
          <Banner tone="error">{errorMessage(save.error)}</Banner>
        </div>
      )}
      <div className="form-grid mt-4">
        <label>
          SKU / barcode
          <input
            required
            autoFocus={!item}
            disabled={Boolean(item)}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._\-]*"
            data-error-pattern="Use letters, digits, dots, dashes or underscores only"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="e.g. 8901234560011"
          />
        </label>
        <label>
          Type
          <SelectInput value={type} onChange={(e) => setType(e.target.value as ProductType)}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectInput>
        </label>
        <label className="full">
          Product name
          <input
            required
            autoFocus={Boolean(item)}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Minoxidil 5% topical solution 60 ml"
          />
        </label>
        <label>
          Company / brand
          <input
            required
            maxLength={80}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Cipla"
          />
        </label>
        <label>
          Batch no.
          <input
            required
            maxLength={40}
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            placeholder="e.g. MX5-2406"
          />
        </label>
        <label>
          {item ? "Stock quantity" : "Opening stock"}
          <input
            required
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          Reorder level
          <input
            required
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
          />
        </label>
        <label>
          Cost price (₹)
          <input
            required
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label>
          Selling price (₹)
          <input
            required
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>
        {belowCost && <p className="field-hint full">Selling price is below the cost price.</p>}
        <label>
          Expiry date
          <DateInput required value={expiryDate} onChange={setExpiryDate} />
        </label>
        <div className="product-image-field">
          <label>
            Image URL (optional)
            <input
              maxLength={500}
              pattern="(https?://\S+|/[\w\-.\/]+)"
              data-error-pattern="Enter an https:// link, or a path on this site such as /products/serum.svg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <ProductThumb item={{ imageUrl: imageUrl.trim() || null, name }} />
        </div>
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : item ? (
            "Save changes"
          ) : (
            "Add product"
          )}
        </Button>
      </DialogFooter>
    </ValidatedForm>
  );
}

/* ---------- stock adjustment ---------- */

function AdjustStockForm({
  item,
  onDone,
  onCancel,
}: {
  item: InventoryItem;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { adjust } = useInventoryMutations();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const amount = Number(quantity) || 0;
  const change = direction === "in" ? amount : -amount;
  const next = item.stockQuantity + change;
  const tooMany = direction === "out" && amount > item.stockQuantity;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!amount || tooMany) return;
    adjust.mutate(
      { id: item.id, change },
      {
        onSuccess: (saved) =>
          onDone(
            `${direction === "in" ? "Added" : "Removed"} ${amount} × ${saved.name} · ${saved.stockQuantity} in stock.`,
          ),
      },
    );
  };

  return (
    <ValidatedForm onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {item.name} · SKU {item.id} · {item.stockQuantity} in stock
        </DialogDescription>
      </DialogHeader>
      {adjust.isError && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage(adjust.error)}</Banner>
        </div>
      )}
      <div className="form-grid mt-4">
        <div className="full stock-direction" role="radiogroup" aria-label="Adjustment">
          <Button
            type="button"
            variant="outline"
            role="radio"
            aria-checked={direction === "in"}
            className={cn(direction === "in" && "is-active")}
            onClick={() => setDirection("in")}
          >
            <Plus />
            Restock
          </Button>
          <Button
            type="button"
            variant="outline"
            role="radio"
            aria-checked={direction === "out"}
            className={cn(direction === "out" && "is-active")}
            onClick={() => setDirection("out")}
          >
            <Minus />
            Sold / dispensed
          </Button>
        </div>
        <label className="full">
          Quantity
          <input
            required
            autoFocus
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={tooMany}
            placeholder="0"
          />
        </label>
        {tooMany ? (
          <p className="field-hint full">Only {item.stockQuantity} in stock.</p>
        ) : (
          amount > 0 && (
            <p className="full stock-preview">
              New stock: <strong>{next}</strong>
              {next <= item.reorderLevel && ` · at or below reorder level (${item.reorderLevel})`}
            </p>
          )
        )}
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={adjust.isPending || !amount || tooMany}>
          {adjust.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            "Update stock"
          )}
        </Button>
      </DialogFooter>
    </ValidatedForm>
  );
}
