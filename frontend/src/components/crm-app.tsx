import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode, useCallback } from "react";
import { PhoneInput } from "@/components/form/phone-input";
import { ValidatedForm } from "@/components/form/validated-form";
import {
  Activity, AlertTriangle, BarChart3, Bell, BellRing, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleDollarSign, RefreshCw, ClipboardList, ClipboardPlus, Clock3, CreditCard, FileText,
  FlaskConical, LayoutDashboard, ListOrdered, LoaderCircle, LogOut, Menu, MessageCircle, Moon, MoreHorizontal, Package,
  Phone, Plus, Search, Settings, Sparkles, Sun, UserRound, Users, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, getToken } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useSocketEvent } from "@/lib/socket";
import { Banner, PageHeader, SectionHeader, StatusChip } from "@/components/crm-ui";
import { AppointmentsView, type Scheduling } from "@/components/appointments/appointments-view";
import { AppointmentDialog } from "@/components/appointments/book-appointment-dialog";
import { CheckInTick } from "@/components/appointments/check-in-tick";
import { PendingBookingsQueue } from "@/components/appointments/pending-bookings";
import { AppointmentChips } from "@/components/appointments/appointment-chips";
import { UpcomingSurgeries } from "@/components/appointments/upcoming-surgeries";
import { BillingView } from "@/components/billing/billing-view";
import { InventoryView } from "@/components/inventory/inventory-view";
import { RemindersView } from "@/components/reminders/reminders-view";
import { useDashboardSummary } from "@/components/dashboard/dashboard-api";
import { inr } from "@/components/settings/catalog-settings";
import { clinicTimeOf, useAppointments } from "@/components/appointments/appointments-api";
import { clinicToday, formatDay } from "@/components/patients/patients-api";
import { PatientHistoryDialog } from "@/components/history/patient-history-dialog";
import { HistoryView } from "@/components/history/history-view";
import { AddPatientDialog, EditPatientDialog, PatientProfileDialog, type EditTab } from "@/components/patients/patient-dialogs";
import { formatVisit, usePatients, type Patient } from "@/components/patients/patients-api";
import { LayoutToggle, PatientCards } from "@/components/patients/patient-cards";
import { rememberPatientLayout, savedPatientLayout, type PatientLayout } from "@/components/patients/patient-layout";
import { CatalogDialog, ConcernCatalogPanel, TreatmentCatalogPanel, type CatalogEditor } from "@/components/settings/catalog-settings";
import { PlansSettingsPanel } from "@/components/plans/plans-settings";
import { ClinicTimingsSettings } from "@/components/settings/clinic-timings-settings";
import type { TreatmentPlan } from "@/components/plans/plans-api";
import logoMark from "@/assets/logo-mark.png";
import { useNavigate } from "@tanstack/react-router";
import { consumeJustLoggedIn, getSessionUser, greetingName, initials, mockSignOut, ROLE_LABELS } from "@/lib/mock-auth";

type ClinicAlert = { tone: "success" | "warning" | "error" | "neutral"; title: string; message: string; at: string };
type View = "Dashboard" | "Patients" | "History" | "Appointments" | "Leads" | "Treatments" | "Billing" | "Inventory" | "Reminders" | "Reports" | "Settings";
type Icon = ComponentType<{ className?: string }>;

const navItems: { label: View; icon: Icon }[] = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Patients", icon: Users },
  { label: "History", icon: ClipboardList },
  { label: "Appointments", icon: CalendarDays }, { label: "Leads", icon: MessageCircle },
  { label: "Treatments", icon: FlaskConical }, { label: "Billing", icon: CreditCard },
  { label: "Inventory", icon: Package },
  { label: "Reminders", icon: BellRing }, { label: "Reports", icon: BarChart3 }, { label: "Settings", icon: Settings },
];



const leads = [
  { name: "Nikhil Pawar", source: "Instagram", interest: "Hair transplant", value: "₹85,000", next: "Call today", stage: "New" },
  { name: "Priya Nair", source: "WhatsApp", interest: "PRP package", value: "₹18,000", next: "WhatsApp · 4 PM", stage: "Contacted" },
  { name: "Akash Mehta", source: "Referral", interest: "Hair transplant", value: "₹1,10,000", next: "Consult · 27 Sep", stage: "Consultation" },
  { name: "Shreya Gupta", source: "Website", interest: "PRP package", value: "₹24,000", next: "Follow-up · 28 Sep", stage: "Qualified" },
];




function MetricCard({ label, value, note, icon: Icon, trend }: { label: string; value: string; note: string; icon: Icon; trend?: "up" | "down" | undefined }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div><strong>{value}</strong><div className="metric-trend"><span className={cn("metric-note", trend && `trend-${trend}`)}>{trend === "up" ? "↑ " : trend === "down" ? "↓ " : ""}{note}</span></div></article>;
}

/** "Good morning" / "Good afternoon" / "Good evening" in clinic time. */
function greetingFor(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const inrShort = (n: number) => n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(n >= 10_00_000 ? 1 : 2).replace(/\.?0+$/, "")}L` : inr.format(n);
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);


function DataTable({ children }: { children: ReactNode }) { return <div className="table-wrap"><table>{children}</table></div>; }

function Dashboard({ onBook, onCalendar, onSchedule, onPatient, onViewPatients, onNotice, userName }: { onBook: () => void; onCalendar: () => void; onSchedule: (pkg: { id: string; patientId: string }, index?: number) => void; onPatient: (id: string) => void; onViewPatients: () => void; onNotice: (message: string) => void; userName: string }) {
  const patientsQuery = usePatients();
  const todayQuery = useAppointments({ date: clinicToday() });
  const todays = todayQuery.data ?? [];
  const pending = todays.filter(a => a.status === "Scheduled").length;
  const summaryQuery = useDashboardSummary();
  const summary = summaryQuery.data;
  const mix = summary?.treatmentMix;
  const monthLabel = new Date(`${clinicToday().slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const collectedPct = summary ? Math.min(100, pct(summary.revenue.thisMonth, summary.revenue.billedThisMonth)) : 0;
  // Donut slices: PRP, transplant, consultation, other.
  const slices = mix ? [mix.prp, mix.transplant, mix.consultation, mix.other] : [0, 0, 0, 0];
  const stops = slices.reduce<{ at: number; parts: string[] }>((acc, n, i) => {
    const end = acc.at + pct(n, mix?.total ?? 0);
    acc.parts.push(`var(--mix-${i}) ${acc.at}% ${end}%`);
    return { at: end, parts: acc.parts };
  }, { at: 0, parts: [] });
  // Schedule rows are still sample data; open the matching record when there is one.
  const openByName = (name: string) => { const match = patientsQuery.data?.find(p => p.name === name); if (match) onPatient(match.id); else onViewPatients(); };
  return <>
    <PageHeader title={`${greetingFor()}, ${greetingName(userName)}`} description={`${new Date(`${clinicToday()}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Pune clinic`} action="Book appointment" onAction={onBook} />
    {summaryQuery.isError && <Banner tone="error">Couldn’t load dashboard figures. Make sure the backend is running and you signed in with it.</Banner>}
    <div className="metrics-grid">
      {!summary ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] w-full" />) : <>
        <MetricCard label="Total patients" value={summary.patients.total.toLocaleString("en-IN")} note={`${summary.patients.newThisMonth} new this month`} icon={Users} />
        <MetricCard label="Revenue this month" value={inrShort(summary.revenue.thisMonth)} icon={CircleDollarSign}
          {...(summary.revenue.lastMonth > 0
            ? { note: `${Math.abs(pct(summary.revenue.thisMonth - summary.revenue.lastMonth, summary.revenue.lastMonth))}% vs last month`, trend: summary.revenue.thisMonth >= summary.revenue.lastMonth ? "up" as const : "down" as const }
            : { note: `${inr.format(summary.revenue.today)} received today` })} />
        <MetricCard label="PRP sessions this month" value={String(summary.prpSessions.thisMonth)} note={`${summary.prpSessions.completed} completed`} icon={Activity} />
        <MetricCard label="Avg grafts this month" value={summary.grafts.total ? summary.grafts.average.toLocaleString("en-IN") : "—"} note={`${summary.grafts.surgeries} ${summary.grafts.surgeries === 1 ? "surgery" : "surgeries"} · ${summary.grafts.total.toLocaleString("en-IN")} grafts this month${summary.grafts.awaitingCount ? ` · ${summary.grafts.awaitingCount} awaiting count` : ""}`} icon={Sparkles} />
      </>}
    </div>
    <div className="dashboard-grid">
      <section className="panel schedule-panel"><SectionHeader title="Today’s schedule" subtitle={todayQuery.data ? `${todays.length} appointments · ${pending} pending` : "Loading…"} trailing={<Button variant="outline" onClick={onCalendar}>View calendar<ChevronRight /></Button>} />
        {todayQuery.isError ? <div className="table-error"><Banner tone="error">Couldn’t load today’s appointments.</Banner></div> : todayQuery.isPending ? <div className="table-loading">{Array.from({length:3},(_,i)=><Skeleton key={i} className="h-10 w-full"/>)}</div> : todays.length === 0 ? <div className="empty-state"><CalendarDays /><h3>No appointments today</h3><p>Sessions booked from packages will appear here.</p></div> :
        <div className="schedule-list">{todays.slice(0,5).map((item) => <div key={item.id} className="schedule-item"><CheckInTick appointment={item} onNotice={onNotice} /><button className="schedule-row" onClick={()=>item.patientId ? onPatient(item.patientId) : openByName(item.patientName)}><time>{clinicTimeOf(item.startsAt)}</time><span className="schedule-avatar">{initials(item.patientName)}</span><span className="schedule-info"><strong>{item.patientName}</strong><small>{item.type}</small></span><AppointmentChips appointment={item} /><ChevronRight className="row-arrow" /></button></div>)}</div>}
      </section>
      <section className="panel"><SectionHeader title="Treatment mix" subtitle={`${monthLabel} · this month’s visits`} />
        <div className="donut-area">
          <div className={cn("donut", !mix?.total && "donut-empty")} style={mix?.total ? { background: `conic-gradient(${stops.parts.join(", ")})` } : undefined}><div><strong>{mix?.total ?? 0}</strong><span>treatments</span></div></div>
          <div className="legend">
            {([["PRP sessions", mix?.prp], ["Transplants", mix?.transplant], ["Consultations", mix?.consultation], ["Other", mix?.other]] as const).map(([label, n], i) => <p key={label}><i style={{ background: `var(--mix-${i})` }} />{label} <b>{n ?? 0} · {pct(n ?? 0, mix?.total ?? 0)}%</b></p>)}
          </div>
        </div>
        <div className="progress-block">
          <div><span>Collected this month</span><strong>{summary ? `${inrShort(summary.revenue.thisMonth)} of ${inrShort(summary.revenue.billedThisMonth)} billed` : "—"}</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Collected vs billed this month" aria-valuenow={collectedPct} aria-valuemin={0} aria-valuemax={100}><span className="progress-fill" style={{ width: `${collectedPct}%` }} /></div>
          {summary && <small className="progress-note">{inr.format(summary.revenue.outstanding)} still to collect in total</small>}
          {summary && summary.revenue.unpaidVisits.count > 0 && <small className="progress-note progress-note-warning">{summary.revenue.unpaidVisits.count} completed {summary.revenue.unpaidVisits.count === 1 ? "visit" : "visits"} payment pending · {inr.format(summary.revenue.unpaidVisits.amount)}</small>}
        </div>
      </section>
    </div>
    <UpcomingSurgeries limit={5} onViewAll={onCalendar} onOpenPatient={onPatient} />
    <PendingBookingsQueue limit={5} onViewAll={onCalendar} onSchedule={p => onSchedule({ id: p.packageId, patientId: p.patientId }, p.stepIndex)} />
    <section className="panel"><SectionHeader title="Recent patients" subtitle="Latest clinic activity" trailing={<Button variant="ghost" onClick={onViewPatients}>View all<ChevronRight /></Button>} /><PatientRecords query={patientsQuery} limit={4} onSelect={onPatient} /></section>
  </>;
}

function PatientTable({ rows, onSelect }: { rows: Patient[]; onSelect: (id: string) => void }) {
  return <DataTable><thead><tr><th>Patient</th><th>Concern</th><th>Treatment</th><th>Last visit</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((p)=><tr key={p.id} onClick={()=>onSelect(p.id)}><td><div className="person"><span>{initials(p.name)}</span><div><strong>{p.name}</strong><small>{p.id}{p.age != null && ` · ${p.age} yrs`}</small></div></div></td><td>{p.concern ?? <span className="text-muted-foreground">Not recorded</span>}</td><td>{p.treatment}</td><td>{formatVisit(p.lastVisit)}</td><td><Button variant="ghost" size="icon" aria-label={`Open ${p.name}`} onClick={e=>{e.stopPropagation();onSelect(p.id)}}><MoreHorizontal /></Button></td></tr>)}</tbody></DataTable>;
}

/** Patient table with loading, error and empty states. */
function PatientRecords({ query, rows, limit, onSelect }: { query: ReturnType<typeof usePatients>; rows?: Patient[]; limit?: number; onSelect: (id: string) => void }) {
  if (query.isPending) return <div className="table-loading" aria-label="Loading patients">{Array.from({length:4},(_,i)=><div className="skeleton-row" key={i}><Skeleton className="size-9"/><div><Skeleton className="h-3 w-40"/><Skeleton className="mt-2 h-3 w-24"/></div><Skeleton className="ml-auto h-6 w-16"/></div>)}</div>;
  if (query.isError) return <div className="table-error"><Banner tone="error">Couldn’t load patients. Make sure the backend is running and you signed in with it.</Banner><Button variant="outline" onClick={()=>query.refetch()} disabled={query.isRefetching}><RefreshCw className={query.isRefetching?"animate-spin":undefined}/>Try again</Button></div>;
  const list = (rows ?? query.data).slice(0, limit);
  return <PatientTable rows={list} onSelect={onSelect} />;
}

function PatientsView({ onAdd, onSelect }: { onAdd: () => void; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [layout, setLayoutState] = useState<PatientLayout>(savedPatientLayout);
  const setLayout = (next: PatientLayout) => { setLayoutState(next); rememberPatientLayout(next); };
  const patientsQuery = usePatients();
  const q = query.trim().toLowerCase();
  const filtered = (patientsQuery.data ?? []).filter(p => !q || `${p.name} ${p.id} ${p.phone} ${p.concern ?? ""} ${p.treatment}`.toLowerCase().includes(q));
  return <><PageHeader title="Patients" description="Clinical records, treatment plans and progress history" action="Add patient" onAction={onAdd} /><div className="toolbar"><label className="field-search"><Search /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, phone or patient ID" /></label><Button variant="outline"><FlaskConical />All treatments<ChevronDown /></Button><Button variant="outline"><FileText />Export</Button></div><section className="panel"><SectionHeader title={patientsQuery.data ? `${filtered.length} patients` : "Patients"} subtitle="Click a patient to view, edit or create a package" trailing={<LayoutToggle value={layout} onChange={setLayout} />} />{layout === "cards" && patientsQuery.data ? (filtered.length > 0 && <PatientCards rows={filtered} onSelect={onSelect} />) : <PatientRecords query={patientsQuery} rows={filtered} onSelect={onSelect} />}{patientsQuery.data && filtered.length === 0 && <div className="empty-state"><Search /><h3>No patients found</h3><p>Try a different name, phone number or patient ID.</p></div>}</section></>;
}


function LeadsView({ onAdd }: { onAdd: () => void }) {
  const stages = ["New", "Contacted", "Consultation", "Qualified"];
  return <><PageHeader title="Leads" description="Track enquiries and move prospects toward consultation" action="Add enquiry" onAction={onAdd} /><Banner tone="warning">3 follow-ups are due today. Prioritise leads waiting more than 24 hours.</Banner><div className="pipeline">{stages.map((stage, i)=><section className="pipeline-column" key={stage}><header><div><span className="pipeline-count">{i+1}</span><h2>{stage}</h2></div><strong>{leads.filter(l=>l.stage===stage).length}</strong></header>{leads.filter(l=>l.stage===stage).map(l=><article className="lead-card" key={l.name}><div className="lead-title"><div className="person"><span>{l.name.split(" ").map(n=>n[0]).join("")}</span><div><strong>{l.name}</strong><small>{l.source}</small></div></div><Button variant="ghost" size="icon"><MoreHorizontal /></Button></div><p>{l.interest}</p><div className="lead-value"><span>Potential value</span><strong>{l.value}</strong></div><button className="followup"><Clock3 />{l.next}</button><div className="lead-actions"><Button variant="outline" size="icon" aria-label="Call lead"><Phone /></Button><Button variant="outline"><MessageCircle />WhatsApp</Button></div></article>)}</section>)}</div></>;
}

function TreatmentsView({ onAdd }: { onAdd: () => void }) {
  const rows = [
    ["Ananya Deshmukh","PRP","Session 3 of 6","26 Sep 2026","Improving","Active"], ["Rohan Kulkarni","Transplant","3,200 grafts · Norwood IV","12 Sep 2026","Day 14 recovery","Recovery"], ["Meera Shah","PRP","Session 1 of 4","17 Sep 2026","Baseline","Active"], ["Arjun Sethi","Transplant","2,450 grafts · Norwood III","04 Sep 2026","Good density","Review due"], ["Kavita Rao","PRP","Session 5 of 6","15 Sep 2026","Visible regrowth","Active"],
  ];
  return <><PageHeader title="Treatments" description="PRP courses, transplant procedures and outcome tracking" action="Record treatment" onAction={onAdd} /><div className="metrics-grid compact"><MetricCard label="Active PRP plans" value="64" note="6 this week" icon={Activity}/><MetricCard label="Transplants this month" value="18" note="3 planned" icon={Sparkles}/><MetricCard label="Average graft count" value="2,840" note="4.6%" icon={Zap}/><MetricCard label="Reviews due" value="9" note="2 overdue" icon={Clock3}/></div><section className="panel"><SectionHeader title="Treatment records" subtitle="Recent sessions and procedures" /><DataTable><thead><tr><th>Patient</th><th>Type</th><th>Plan / procedure</th><th>Last session</th><th>Outcome</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td><StatusChip tone={r[5]==="Active"?"success":r[5]==="Recovery"?"warning":"neutral"}>{r[5]}</StatusChip></td></tr>)}</tbody></DataTable></section></>;
}


function ReportsView({ onExport }: { onExport: () => void }) {
  const months = [48,61,55,72,68,82,76,91,84,94,88,98];
  return <><PageHeader title="Reports" description="Revenue, treatment outcomes and clinic performance" action="Export report" onAction={onExport} /><div className="metrics-grid compact"><MetricCard label="Revenue YTD" value="₹82.6L" note="16.8%" icon={CircleDollarSign}/><MetricCard label="Patient retention" value="78%" note="4.1%" icon={Users}/><MetricCard label="PRP completion" value="84%" note="6.2%" icon={Activity}/><MetricCard label="Lead conversion" value="31%" note="2.8%" icon={BarChart3}/></div><div className="reports-grid"><section className="panel chart-panel"><SectionHeader title="Monthly revenue" subtitle="October 2025 – September 2026" trailing={<StatusChip tone="success">+16.8% YoY</StatusChip>} /><div className="bar-chart">{months.map((h,i)=><div key={i}><span style={{height:`${h}%`}} /><small>{["O","N","D","J","F","M","A","M","J","J","A","S"][i]}</small></div>)}</div></section><section className="panel"><SectionHeader title="Outcome quality" subtitle="Patient-reported at 6 months" /><div className="outcomes">{[["Excellent","62%"],["Good","28%"],["Moderate","8%"],["Needs review","2%"]].map(([l,v])=><div key={l}><div><span>{l}</span><strong>{v}</strong></div><div className="progress-track"><span className="progress-fill" style={{width:v}} /></div></div>)}</div></section></div></>;
}

type SettingsTab = "Team access" | "Treatments" | "Treatment plans" | "Concerns" | "Clinic profile" | "Clinic timings" | "Notifications" | "Billing settings";
const settingsTabs: { label: SettingsTab; icon: Icon }[] = [
  { label: "Team access", icon: UserRound }, { label: "Treatments", icon: FlaskConical }, { label: "Treatment plans", icon: ListOrdered }, { label: "Concerns", icon: ClipboardList },
  { label: "Clinic profile", icon: Settings }, { label: "Clinic timings", icon: Clock3 }, { label: "Notifications", icon: Bell }, { label: "Billing settings", icon: CreditCard },
];

function SettingsView({ onInvite, onNotice, onOpenAppointments, isAdmin }: { onInvite: () => void; onNotice: (message: string) => void; onOpenAppointments: () => void; isAdmin: boolean }) {
  const [tab, setTab] = useState<SettingsTab>("Team access");
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [planEditing, setPlanEditing] = useState<"new" | TreatmentPlan | null>(null);
  const header = tab === "Treatments" ? { action: "Add treatment", onAction: () => setEditor({ kind: "treatments" }) }
    : tab === "Concerns" ? { action: "Add concern", onAction: () => setEditor({ kind: "concerns" }) }
    : tab === "Treatment plans" ? { action: "New plan", onAction: () => setPlanEditing("new") }
    : tab === "Team access" ? { action: "Invite team member", onAction: onInvite } : {};
  const canAct = tab === "Team access" || tab === "Treatment plans" || isAdmin;
  const panel = tab === "Team access"
    ? <section className="panel"><SectionHeader title="Team access" subtitle="Manage members and their permissions" /><div className="team-list">{[["DB","Dr. Bhushan Patil","Admin · Lead doctor","Active"],["SD","Dr. Sonal Desai","Doctor","Active"],["PM","Priya More","Reception","Active"],["AK","Ashwini Kale","Reception","Invited"]].map(m=><div className="team-row" key={m[1]}><span className="team-avatar">{m[0]}</span><div><strong>{m[1]}</strong><small>{m[2]}</small></div><StatusChip tone={m[3]==="Active"?"success":"warning"}>{m[3]}</StatusChip><Button variant="ghost" size="icon"><MoreHorizontal/></Button></div>)}</div></section>
    : tab === "Treatments" ? <TreatmentCatalogPanel isAdmin={isAdmin} onNotice={onNotice} onEdit={(item) => setEditor({ kind: "treatments", item })} />
    : tab === "Treatment plans" ? <PlansSettingsPanel editing={planEditing} onEditingChange={setPlanEditing} onNotice={onNotice} />
    : tab === "Concerns" ? <ConcernCatalogPanel isAdmin={isAdmin} onNotice={onNotice} onEdit={(item) => setEditor({ kind: "concerns", item })} />
    : tab === "Clinic timings" ? <ClinicTimingsSettings onNotice={onNotice} onReschedule={onOpenAppointments} />
    : <section className="panel"><SectionHeader title={tab} /><div className="empty-state"><Settings /><h3>Coming soon</h3><p>{tab} will be configurable here.</p></div></section>;
  return <><PageHeader title="Settings" description="Clinic preferences, team access, treatments, plans and concerns" action={canAct ? header.action : undefined} onAction={header.onAction} /><div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{settingsTabs.map(t => <button key={t.label} className={cn(tab === t.label && "active")} aria-current={tab === t.label ? "page" : undefined} onClick={() => setTab(t.label)}><t.icon />{t.label}</button>)}</nav>{panel}</div><CatalogDialog editor={editor} onOpenChange={(open) => !open && setEditor(null)} onNotice={onNotice} /></>;
}

function ActionModal({ open, onOpenChange, kind, onSuccess }: { open: boolean; onOpenChange: (v:boolean)=>void; kind: string; onSuccess: (message:string)=>void }) {
  const [saving,setSaving]=useState(false); const [phone,setPhone]=useState("");
  const submit=(e:FormEvent)=>{e.preventDefault();setSaving(true);setTimeout(()=>{setSaving(false);setPhone("");onOpenChange(false);onSuccess(`${kind} saved successfully.`)},700)};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{kind}</DialogTitle><DialogDescription>Add the key details now. You can update the complete clinical record later.</DialogDescription></DialogHeader><ValidatedForm onSubmit={submit}><div className="form-grid"><label>Patient name<input required maxLength={120} placeholder="Enter full name" /></label><label>Mobile number<PhoneInput required value={phone} onChange={setPhone} /></label><label className="full">Notes<textarea placeholder="Add clinical or follow-up notes" /></label></div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?<><LoaderCircle className="animate-spin"/>Saving…</>:<>Save details</>}</Button></DialogFooter></ValidatedForm></DialogContent></Dialog>;
}


function AppLoader({ label }: { label: string }) {
  return <div className="app-loader" role="status" aria-label={label}>
    <div className="app-loader-inner">
      <div className="app-loader-logo">
        <svg className="app-loader-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r="54" />
          <circle className="ring-progress" cx="60" cy="60" r="54" />
        </svg>
        <img src={logoMark} alt="" width={54} height={54} />
      </div>
      <strong>Dr. Bhushan’s Rejuvenation</strong>
      <span>{label}</span>
    </div>
  </div>;
}

function LoadingShowcase() { return <div className="loading-card" aria-label="Loading patient records"><div className="loading-title"><LoaderCircle className="animate-spin"/><span>Refreshing records…</span></div><div className="skeleton-row"><Skeleton className="size-10"/><div><Skeleton className="h-3 w-36"/><Skeleton className="mt-2 h-3 w-24"/></div><Skeleton className="ml-auto h-6 w-16"/></div></div>; }

export function CRMApp() {
  const [view,setView]=useState<View>("Dashboard"); const [mobile,setMobile]=useState(false); const [dark,setDark]=useState(false);
  const [action,setAction]=useState<string|null>(null); const [profile,setProfile]=useState<string|null>(null); const [editing,setEditing]=useState<{id:string;tab:EditTab;planId?:string}|null>(null); const [booking,setBooking]=useState(false); const [addingPatient,setAddingPatient]=useState(false); const [historyFor,setHistoryFor]=useState<string|null>(null); const [scheduling,setScheduling]=useState<Scheduling|null>(null); const [notice,setNotice]=useState<string|null>(null); const [notifications,setNotifications]=useState(false); const [alerts,setAlerts]=useState<ClinicAlert[]>([]); const [unread,setUnread]=useState(0); const [globalSearch,setGlobalSearch]=useState(""); const [loading,setLoading]=useState(false);
  const [booting,setBooting]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("drb-just-logged-in")==="1"); const [overlay,setOverlay]=useState<string|null>(null);
  useEffect(()=>{const isDark=localStorage.getItem("drb-theme")==="dark";setDark(isDark);document.documentElement.classList.toggle("dark",isDark)},[]);
  useEffect(()=>{if(!booting)return;consumeJustLoggedIn();const t=setTimeout(()=>setBooting(false),3000);return ()=>clearTimeout(t)},[booting]);
  const nav=useNavigate();
  const [user]=useState(getSessionUser);
  // Sidebar status: real server health, re-checked every minute.
  const health=useQuery({queryKey:["health"],queryFn:()=>api<{status:string}>("/health"),refetchInterval:60_000,retry:0});
  // Live notifications pushed by the server (e.g. "Payment received"); kept for this session.
  const onAlert=useCallback((n:ClinicAlert)=>{setAlerts(list=>[n,...list].slice(0,20));setUnread(u=>u+1)},[]);
  useSocketEvent<ClinicAlert>("notification",onAlert,getToken()!==null);
  const canCreatePackages=user.role==="Admin"||user.role==="Doctor";
  const handleSignOut=()=>{setOverlay("Signing you out…");setTimeout(()=>{mockSignOut();nav({to:"/auth",replace:true})},2000)};
  const toggleTheme=()=>setDark(v=>{const next=!v;document.documentElement.classList.toggle("dark",next);localStorage.setItem("drb-theme",next?"dark":"light");return next});
  const navigate=useCallback((label:View)=>{setLoading(true);setView(label);setMobile(false);setTimeout(()=>setLoading(false),900)},[]);
  const scheduleSessions=useCallback((pkg:{id:string;patientId:string},index?:number)=>{setProfile(null);setEditing(null);setScheduling({packageId:pkg.id,patientId:pkg.patientId,...(index!==undefined&&{index})});navigate("Appointments")},[navigate]);
  const title = view;
  const content=useMemo(()=>{const show=(k:string)=>setAction(k); switch(view){case "Dashboard":return <Dashboard onNotice={setNotice} onBook={()=>setBooking(true)} onCalendar={()=>navigate("Appointments")} onSchedule={scheduleSessions} onPatient={setProfile} onViewPatients={()=>navigate("Patients")} userName={user.name}/>;case "Patients":return <PatientsView onAdd={()=>setAddingPatient(true)} onSelect={setProfile}/>;case "History":return <HistoryView onOpen={setHistoryFor}/>;case "Appointments":return <AppointmentsView scheduling={scheduling} onStartScheduling={setScheduling} onEndScheduling={()=>setScheduling(null)} onOpenPatient={setProfile} onCreatePackage={(id,planId)=>setEditing({id,tab:"package",planId})} onNotice={setNotice}/>;case "Leads":return <LeadsView onAdd={()=>show("Add enquiry")}/>;case "Treatments":return <TreatmentsView onAdd={()=>show("Record treatment")}/>;case "Billing":return <BillingView onNotice={setNotice} onOpenPatient={setProfile}/>;case "Inventory":return <InventoryView isAdmin={user.role==="Admin"} onNotice={setNotice}/>;case "Reminders":return <RemindersView onNotice={setNotice}/>;case "Reports":return <ReportsView onExport={()=>{setNotice("Report exported successfully.")}}/>;case "Settings":return <SettingsView onInvite={()=>show("Invite team member")} onNotice={setNotice} onOpenAppointments={()=>navigate("Appointments")} isAdmin={user.role==="Admin"}/>;}},[view,user.name,user.role,scheduling,scheduleSessions,navigate]);
  return <div className="app-shell">
    {(booting||overlay)&&<AppLoader label={booting?"Preparing your clinic workspace…":overlay??"Loading…"}/>}
    {mobile&&<button className="mobile-overlay" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}
    <aside className={cn("sidebar",mobile&&"mobile-open")}><div className="brand"><div className="brand-mark"><img src={logoMark} alt="Dr. Bhushan’s Rejuvenation logo" width={38} height={38} loading="lazy"/></div><div><strong>Dr. Bhushan’s</strong><span>REJUVENATION</span></div><Button variant="ghost" size="icon" className="mobile-close" onClick={()=>setMobile(false)} aria-label="Close menu"><X/></Button></div><div className="clinic-label">Clinic workspace</div><nav>{navItems.map(item=><button key={item.label} onClick={()=>navigate(item.label)} className={cn(view===item.label&&"active")}><item.icon/><span>{item.label}</span>{view===item.label&&<ChevronRight/>}</button>)}</nav><div className="sidebar-foot"><div className={cn("support",health.isError&&"support-down")}><span><Activity/></span><div><strong>Clinic status</strong><small>{health.isPending?"Checking…":health.isError?"Server unreachable":"All systems operational"}</small></div></div><p>Dr. Bhushan’s Rejuvenation<br/>Pune, Maharashtra</p></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-left"><Button variant="ghost" size="icon" className="menu-button" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></Button><div><span className="mobile-title">{title}</span></div><label className="global-search"><Search/><input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="Search patients, appointments…"/><kbd>⌘ K</kbd></label></div><div className="top-actions"><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark?"Use light mode":"Use dark mode"}>{dark?<Sun/>:<Moon/>}</Button><DropdownMenu open={notifications} onOpenChange={v=>{setNotifications(v);if(v)setUnread(0)}}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="notification-button" aria-label={unread?`Notifications, ${unread} new`:"Notifications"}><Bell/>{unread>0&&<span>{unread>9?"9+":unread}</span>}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="notification-menu"><DropdownMenuLabel>Notifications</DropdownMenuLabel><DropdownMenuSeparator/>{alerts.length===0?<p className="notification-empty">You’re all caught up. Payments and other updates will show here as they happen.</p>:alerts.slice(0,8).map((n,i)=><DropdownMenuItem key={`${n.at}-${i}`}><span className={cn("menu-icon",n.tone==="success"&&"success",n.tone==="warning"&&"warning")}>{n.tone==="success"?<Check/>:n.tone==="warning"?<Clock3/>:<CalendarDays/>}</span><div><strong>{n.title}</strong><small>{n.message} · {clinicTimeOf(n.at)}</small></div></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><div className="top-separator"/><DropdownMenu><DropdownMenuTrigger asChild><button className="profile-trigger"><span>{initials(user.name)}</span><div><strong>{greetingName(user.name)}</strong><small>{ROLE_LABELS[user.role]}</small></div><ChevronDown/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{user.name}<small className="block font-normal text-muted-foreground">{user.email}</small></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem onClick={()=>navigate("Settings")}><Settings/>Settings</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={handleSignOut}><LogOut/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
      <main>{notice&&<Banner tone="success" onClose={()=>setNotice(null)}>{notice}</Banner>}{globalSearch.length>1&&<div className="search-result"><Search/><span>Quick search for <strong>“{globalSearch}”</strong></span><button onClick={()=>{setGlobalSearch("");navigate("Patients")}}>Search patient records<ChevronRight/></button></div>}{loading?<LoadingShowcase/>:content}</main>
    </div>
    <AddPatientDialog open={addingPatient} onOpenChange={setAddingPatient} onCreated={p=>{setAddingPatient(false);setNotice(`${p.name} registered as ${p.id}.`);setProfile(p.id)}}/><ActionModal open={action!==null} onOpenChange={v=>!v&&setAction(null)} kind={action??"Add record"} onSuccess={setNotice}/><PatientProfileDialog patientId={profile} canCreatePackages={canCreatePackages} canEditRecord={view==="Patients"} onOpenChange={v=>!v&&setProfile(null)} onEdit={(id,tab)=>{setProfile(null);setEditing({id,tab})}} onOpenHistory={id=>{setProfile(null);setHistoryFor(id)}}/><PatientHistoryDialog patientId={historyFor} canEditClinical={canCreatePackages} isAdmin={user.role==="Admin"} onOpenChange={v=>!v&&setHistoryFor(null)}/><AppointmentDialog open={booking} onOpenChange={setBooking} onSaved={({appointment:a,isNewPatient})=>{setBooking(false);setNotice(`Booked ${a.patientName}${isNewPatient?" (new patient)":""} · ${a.type} at ${clinicTimeOf(a.startsAt)}.`)}}/><EditPatientDialog editing={editing} canCreatePackages={canCreatePackages} onPackageCreated={pkg=>{setEditing(null);setScheduling(null);if(pkg.steps.some(s=>s.surgery)){setProfile(null);navigate("Appointments");setNotice(`${pkg.name} (${pkg.id}) created for ${pkg.patientName}. The surgery is in Pending bookings — click a date to schedule it, or use Schedule in the queue.`)}else{setProfile(pkg.patientId);setNotice(`${pkg.name} (${pkg.id}) created for ${pkg.patientName} · ${pkg.steps.length} visits, first due ${formatDay(pkg.startDate)}. Book each visit as a normal appointment — it links to the plan.`)}}} onOpenChange={v=>!v&&setEditing(null)} onNotice={setNotice}/>
  </div>;
}
