import { useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  IndianRupee,
  RefreshCw,
  Search,
} from "lucide-react";
import { Banner, PageHeader, StatusChip } from "@/components/crm-ui";
import {
  clinicDateOf,
  clinicTimeOf,
  useBillingOverview,
  type DueItem,
} from "@/components/appointments/appointments-api";
import { BillingSection } from "@/components/appointments/billing-section";
import { clinicToday, formatDay } from "@/components/patients/patients-api";
import { inr } from "@/components/settings/catalog-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Tab = "received" | "pending" | "upcoming";

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

function longDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dueLabel(item: DueItem): { text: string; tone: "error" | "warning" | "neutral" } {
  if (item.overdueDays > 0) {
    return {
      text: `Overdue ${item.overdueDays} day${item.overdueDays === 1 ? "" : "s"}`,
      tone: "error",
    };
  }
  if (item.kind === "emi" && item.dueDate === clinicToday())
    return { text: "Due today", tone: "warning" };
  return { text: "Pending", tone: "warning" };
}

/**
 * Billing: money received, what's due now (unpaid bills and EMIs that have fallen due),
 * and EMIs still to come. "Receive payment" opens the same billing panel as the calendar.
 */
export function BillingView({
  onNotice,
  onOpenPatient,
}: {
  onNotice: (message: string) => void;
  onOpenPatient: (id: string) => void;
}) {
  const { data, isPending, isError, refetch, isRefetching } = useBillingOverview();
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [collecting, setCollecting] = useState<{ invoiceId: string; patientName: string } | null>(
    null,
  );
  const [paidMessage, setPaidMessage] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = (x: { patientName: string; description: string; invoiceId: string }) =>
    !q || `${x.patientName} ${x.description} ${x.invoiceId}`.toLowerCase().includes(q);
  const received = (data?.received ?? []).filter(matches);
  const pending = (data?.pending ?? []).filter(matches);
  const upcoming = (data?.upcoming ?? []).filter(matches);
  const m = data?.metrics;

  const patient = (name: string, id?: string) =>
    id ? (
      <button type="button" className="billing-patient" onClick={() => onOpenPatient(id)}>
        {name}
      </button>
    ) : (
      <strong>{name}</strong>
    );

  const collect = (item: { invoiceId: string; patientName: string }) => {
    setPaidMessage(null);
    setCollecting(item);
  };

  return (
    <>
      <PageHeader
        title="Billing"
        description="Payments received, what’s due now, and EMIs still to come"
      />

      {isError ? (
        <div className="table-error">
          <Banner tone="error">
            Couldn’t load billing. Make sure the backend is running and you signed in with it.
          </Banner>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? "animate-spin" : undefined} />
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="metrics-grid compact">
            {isPending || !m ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] w-full" />)
            ) : (
              <>
                <StatCard
                  label="Received this month"
                  value={inr.format(m.receivedThisMonth)}
                  note={`${inr.format(m.receivedToday)} today`}
                  icon={CircleDollarSign}
                />
                <StatCard
                  label="Pending now"
                  value={inr.format(m.pendingTotal)}
                  note={`${m.pendingCount} payment${m.pendingCount === 1 ? "" : "s"} due`}
                  icon={Clock3}
                  tone={m.pendingCount ? "warning" : undefined}
                />
                <StatCard
                  label="Overdue"
                  value={inr.format(m.overdueTotal)}
                  note={m.overdueCount ? `${m.overdueCount} past due date` : "Nothing overdue"}
                  icon={AlertTriangle}
                  tone={m.overdueCount ? "error" : undefined}
                />
                <StatCard
                  label="Upcoming · next 30 days"
                  value={inr.format(m.upcoming30Total)}
                  note={`${m.upcomingCount} EMI${m.upcomingCount === 1 ? "" : "s"} scheduled in all`}
                  icon={CalendarClock}
                />
              </>
            )}
          </div>

          <div className="toolbar">
            <label className="field-search">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient, invoice or treatment"
                aria-label="Search billing"
              />
            </label>
          </div>

          <section className="panel billing-panel">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="billing-tabs">
                <TabsTrigger value="received">
                  Received <span className="tab-count">{received.length}</span>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending <span className="tab-count">{pending.length}</span>
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming <span className="tab-count">{upcoming.length}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="received">
                {isPending ? (
                  <TableSkeleton />
                ) : received.length === 0 ? (
                  <Empty
                    icon={IndianRupee}
                    title="No payments yet"
                    hint="Payments you receive appear here."
                  />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Received</th>
                          <th>Patient</th>
                          <th>For</th>
                          <th>Method</th>
                          <th>Received by</th>
                          <th className="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {received.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{formatDay(clinicDateOf(p.receivedAt))}</strong>
                              <small className="cell-sub">{clinicTimeOf(p.receivedAt)}</small>
                            </td>
                            <td>{patient(p.patientName, p.patientId)}</td>
                            <td className="cell-wrap">
                              {p.description}
                              <small className="cell-sub">{p.invoiceId}</small>
                            </td>
                            <td>
                              {p.method}
                              {p.reference && <small className="cell-sub">{p.reference}</small>}
                            </td>
                            <td>{p.receivedBy.name}</td>
                            <td className="num">
                              <strong className="amount-in">{inr.format(p.amount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pending">
                {isPending ? (
                  <TableSkeleton />
                ) : pending.length === 0 ? (
                  <Empty
                    icon={Clock3}
                    title="Nothing pending"
                    hint="Unpaid bills and EMIs that fall due appear here."
                  />
                ) : (
                  <DueTable
                    items={pending}
                    dateLabel="Due since"
                    patient={patient}
                    status={(i) => {
                      const d = dueLabel(i);
                      return <StatusChip tone={d.tone}>{d.text}</StatusChip>;
                    }}
                    onCollect={collect}
                  />
                )}
              </TabsContent>

              <TabsContent value="upcoming">
                {isPending ? (
                  <TableSkeleton />
                ) : upcoming.length === 0 ? (
                  <Empty
                    icon={CalendarClock}
                    title="No upcoming payments"
                    hint="Set up EMIs from a patient’s bill to see scheduled part payments here."
                  />
                ) : (
                  <DueTable
                    items={upcoming}
                    dateLabel="Due on"
                    patient={patient}
                    status={() => <StatusChip tone="neutral">Scheduled</StatusChip>}
                    onCollect={collect}
                    collectLabel="Receive early"
                  />
                )}
              </TabsContent>
            </Tabs>
          </section>
        </>
      )}

      <Dialog open={collecting !== null} onOpenChange={(open) => !open && setCollecting(null)}>
        <DialogContent className="booking-dialog">
          <DialogHeader>
            <DialogTitle>Billing · {collecting?.patientName}</DialogTitle>
            <DialogDescription>
              Payment details. Add each payment as it’s received.
            </DialogDescription>
          </DialogHeader>
          {paidMessage && (
            <div className="mt-2">
              <Banner tone="success" onClose={() => setPaidMessage(null)}>
                {paidMessage}
              </Banner>
            </div>
          )}
          {collecting && (
            <BillingSection
              key={collecting.invoiceId}
              target={{ invoiceId: collecting.invoiceId }}
              onReceived={(message) => {
                setPaidMessage(message);
                onNotice(`${collecting.patientName} — ${message}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DueTable({
  items,
  dateLabel,
  patient,
  status,
  onCollect,
  collectLabel = "Receive payment",
}: {
  items: DueItem[];
  dateLabel: string;
  patient: (name: string, id?: string) => ReactNode;
  status: (item: DueItem) => ReactNode;
  onCollect: (item: DueItem) => void;
  collectLabel?: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>For</th>
            <th>{dateLabel}</th>
            <th>Status</th>
            <th className="num">Amount</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={`${i.invoiceId}-${i.emiNumber ?? "bill"}`}
              className={cn(i.overdueDays > 0 && "row-overdue")}
            >
              <td>{patient(i.patientName, i.patientId)}</td>
              <td className="cell-wrap">
                {i.description}
                <small className="cell-sub">
                  {i.invoiceId}
                  {i.kind === "emi" && ` · EMI ${i.emiNumber} of ${i.emiCount}`}
                </small>
              </td>
              <td>{longDate(i.dueDate)}</td>
              <td>{status(i)}</td>
              <td className="num">
                <strong>{inr.format(i.amount)}</strong>
              </td>
              <td className="num">
                <Button
                  size="sm"
                  variant={i.overdueDays > 0 ? "default" : "outline"}
                  onClick={() => onCollect(i)}
                >
                  <IndianRupee />
                  {collectLabel}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="table-loading">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="empty-state">
      <Icon />
      <h3>{title}</h3>
      <p>{hint}</p>
    </div>
  );
}
