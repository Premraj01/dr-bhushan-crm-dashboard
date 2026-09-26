import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleDollarSign, ClipboardPlus, Clock3, CreditCard, FileText,
  FlaskConical, LayoutDashboard, LoaderCircle, LogOut, Menu, MessageCircle, Moon, MoreHorizontal,
  Phone, Plus, Search, Settings, Sparkles, Sun, UserRound, Users, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/logo-mark.png";
import { useNavigate } from "@tanstack/react-router";
import { consumeJustLoggedIn, mockSignOut } from "@/lib/mock-auth";

type View = "Dashboard" | "Patients" | "Appointments" | "Leads" | "Treatments" | "Billing" | "Reports" | "Settings";
type Tone = "success" | "warning" | "error" | "neutral";
type Icon = ComponentType<{ className?: string }>;

const navItems: { label: View; icon: Icon }[] = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Patients", icon: Users },
  { label: "Appointments", icon: CalendarDays }, { label: "Leads", icon: MessageCircle },
  { label: "Treatments", icon: FlaskConical }, { label: "Billing", icon: CreditCard },
  { label: "Reports", icon: BarChart3 }, { label: "Settings", icon: Settings },
];

const patients = [
  { id: "PT-1084", name: "Ananya Deshmukh", initials: "AD", age: 32, phone: "+91 98230 78142", concern: "Hair thinning", treatment: "PRP · Session 3/6", lastVisit: "Today", status: "Active" },
  { id: "PT-1083", name: "Rohan Kulkarni", initials: "RK", age: 41, phone: "+91 97654 30218", concern: "Norwood IV", treatment: "Transplant · 3,200 grafts", lastVisit: "18 Sep", status: "Recovery" },
  { id: "PT-1082", name: "Meera Shah", initials: "MS", age: 29, phone: "+91 98906 44109", concern: "Postpartum loss", treatment: "PRP · Session 1/4", lastVisit: "17 Sep", status: "Active" },
  { id: "PT-1081", name: "Siddharth Jain", initials: "SJ", age: 36, phone: "+91 99701 52470", concern: "Receding hairline", treatment: "Consultation", lastVisit: "16 Sep", status: "Follow-up" },
  { id: "PT-1080", name: "Kavita Rao", initials: "KR", age: 45, phone: "+91 98221 90433", concern: "Diffuse thinning", treatment: "PRP · Session 5/6", lastVisit: "15 Sep", status: "Active" },
];

const appointments = [
  { time: "09:30", name: "Ananya Deshmukh", type: "PRP Session 3", doctor: "Dr. Bhushan", status: "Checked in" },
  { time: "10:45", name: "Vikram Bhosale", type: "Initial consultation", doctor: "Dr. Bhushan", status: "Confirmed" },
  { time: "12:00", name: "Rohan Kulkarni", type: "Post-op review", doctor: "Dr. Sonal", status: "Confirmed" },
  { time: "14:30", name: "Meera Shah", type: "PRP Session 1", doctor: "Dr. Bhushan", status: "Waiting" },
  { time: "16:00", name: "Amit Patil", type: "Hair analysis", doctor: "Dr. Sonal", status: "Confirmed" },
];

const leads = [
  { name: "Nikhil Pawar", source: "Instagram", interest: "Hair transplant", value: "₹85,000", next: "Call today", stage: "New" },
  { name: "Priya Nair", source: "WhatsApp", interest: "PRP package", value: "₹18,000", next: "WhatsApp · 4 PM", stage: "Contacted" },
  { name: "Akash Mehta", source: "Referral", interest: "Hair transplant", value: "₹1,10,000", next: "Consult · 27 Sep", stage: "Consultation" },
  { name: "Shreya Gupta", source: "Website", interest: "PRP package", value: "₹24,000", next: "Follow-up · 28 Sep", stage: "Qualified" },
];

function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cn("status-chip", `status-${tone}`)}><span className="status-dot" />{children}</span>;
}

function Banner({ tone, children, onClose }: { tone: Exclude<Tone, "neutral">; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === "success" ? Check : AlertTriangle;
  return <div className={cn("banner", `banner-${tone}`)} role="status"><Icon className="size-4 shrink-0" /><p>{children}</p>{onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Dismiss message"><X /></Button>}</div>;
}

function PageHeader({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="page-header"><div className="min-w-0"><p className="eyebrow">Clinical operations</p><h1>{title}</h1><p className="page-description">{description}</p></div><Button size="lg" onClick={onAction}><Plus />{action}</Button></div>;
}

function MetricCard({ label, value, trend, icon: Icon }: { label: string; value: string; trend: string; icon: Icon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div><strong>{value}</strong><div className="metric-trend"><span>↑ {trend}</span><span>vs last month</span></div></article>;
}

function SectionHeader({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
  return <div className="section-header"><div className="min-w-0"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{trailing}</div>;
}

function DataTable({ children }: { children: ReactNode }) { return <div className="table-wrap"><table>{children}</table></div>; }

function Dashboard({ onBook, onPatient }: { onBook: () => void; onPatient: () => void }) {
  return <>
    <PageHeader title="Good morning, Dr. Bhushan" description="Saturday, 26 September · Pune clinic" action="Book appointment" onAction={onBook} />
    <div className="metrics-grid">
      <MetricCard label="Total patients" value="1,284" trend="8.2%" icon={Users} />
      <MetricCard label="Appointments today" value="12" trend="2 added" icon={CalendarDays} />
      <MetricCard label="Revenue this month" value="₹8.42L" trend="12.4%" icon={CircleDollarSign} />
      <MetricCard label="PRP sessions" value="86" trend="9.1%" icon={Activity} />
    </div>
    <div className="dashboard-grid">
      <section className="panel schedule-panel"><SectionHeader title="Today’s schedule" subtitle="12 appointments · 3 pending" trailing={<Button variant="outline" onClick={onBook}>View calendar<ChevronRight /></Button>} />
        <div className="schedule-list">{appointments.slice(0,4).map((item) => <button key={item.time} className="schedule-row" onClick={onPatient}><time>{item.time}</time><span className="schedule-avatar">{item.name.split(" ").map(n=>n[0]).join("")}</span><span className="schedule-info"><strong>{item.name}</strong><small>{item.type}</small></span><StatusChip tone={item.status === "Checked in" ? "success" : "neutral"}>{item.status}</StatusChip><ChevronRight className="row-arrow" /></button>)}</div>
      </section>
      <section className="panel"><SectionHeader title="Treatment mix" subtitle="September 2026" /><div className="donut-area"><div className="donut"><div><strong>168</strong><span>treatments</span></div></div><div className="legend"><p><i className="legend-a" />PRP sessions <b>51%</b></p><p><i className="legend-b" />Transplants <b>24%</b></p><p><i className="legend-c" />Consultations <b>25%</b></p></div></div><div className="progress-block"><div><span>Monthly target</span><strong>₹8.42L / ₹10L</strong></div><div className="progress-track"><span className="progress-fill w-[84%]" /></div></div></section>
    </div>
    <section className="panel"><SectionHeader title="Recent patients" subtitle="Latest clinic activity" trailing={<Button variant="ghost" onClick={onPatient}>View all<ChevronRight /></Button>} /><PatientTable rows={patients.slice(0,4)} onSelect={onPatient} /></section>
  </>;
}

function PatientTable({ rows, onSelect }: { rows: typeof patients; onSelect: () => void }) {
  return <DataTable><thead><tr><th>Patient</th><th>Concern</th><th>Treatment</th><th>Last visit</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((p)=><tr key={p.id} onClick={onSelect}><td><div className="person"><span>{p.initials}</span><div><strong>{p.name}</strong><small>{p.id} · {p.age} yrs</small></div></div></td><td>{p.concern}</td><td>{p.treatment}</td><td>{p.lastVisit}</td><td><StatusChip tone={p.status === "Active" ? "success" : p.status === "Recovery" ? "warning" : "neutral"}>{p.status}</StatusChip></td><td><Button variant="ghost" size="icon" aria-label={`Open ${p.name}`}><MoreHorizontal /></Button></td></tr>)}</tbody></DataTable>;
}

function PatientsView({ onAdd, onSelect }: { onAdd: () => void; onSelect: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = patients.filter(p => `${p.name} ${p.id} ${p.phone}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeader title="Patients" description="Clinical records, treatment plans and progress history" action="Add patient" onAction={onAdd} /><div className="toolbar"><label className="field-search"><Search /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, phone or patient ID" /></label><Button variant="outline"><FlaskConical />All treatments<ChevronDown /></Button><Button variant="outline"><FileText />Export</Button></div><section className="panel"><SectionHeader title={`${filtered.length} patients`} subtitle="Showing active and recent records" /><PatientTable rows={filtered} onSelect={onSelect} />{filtered.length === 0 && <div className="empty-state"><Search /><h3>No patients found</h3><p>Try a different name, phone number or patient ID.</p></div>}</section></>;
}

function AppointmentsView({ onBook }: { onBook: () => void }) {
  const dates = Array.from({length: 30}, (_, i) => i + 1);
  return <><PageHeader title="Appointments" description="Manage clinic schedules, consultations and follow-ups" action="Book appointment" onAction={onBook} /><div className="calendar-layout"><section className="panel calendar-panel"><SectionHeader title="September 2026" trailing={<div className="button-pair"><Button variant="outline" size="icon">‹</Button><Button variant="outline" size="icon">›</Button></div>} /><div className="calendar-head">{"SMTWTFS".split("").map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div><div className="calendar-grid">{[...Array(2)].map((_,i)=><span key={`blank-${i}`} />)}{dates.map(d=><button className={cn(d===26 && "selected", [3,8,14,21,28].includes(d) && "has-event")} key={d}>{d}</button>)}</div><div className="calendar-key"><span><i className="key-dot" />Appointments scheduled</span><span><i className="key-selected" />Selected date</span></div></section><section className="panel"><SectionHeader title="Saturday, 26 Sep" subtitle="5 appointments" /><div className="agenda">{appointments.map(a=><div className="agenda-row" key={a.time}><time>{a.time}</time><div><strong>{a.name}</strong><span>{a.type} · {a.doctor}</span></div><StatusChip tone={a.status === "Checked in" ? "success" : a.status === "Waiting" ? "warning" : "neutral"}>{a.status}</StatusChip></div>)}</div></section></div></>;
}

function LeadsView({ onAdd }: { onAdd: () => void }) {
  const stages = ["New", "Contacted", "Consultation", "Qualified"];
  return <><PageHeader title="Leads" description="Track enquiries and move prospects toward consultation" action="Add enquiry" onAction={onAdd} /><Banner tone="warning">3 follow-ups are due today. Prioritise leads waiting more than 24 hours.</Banner><div className="pipeline">{stages.map((stage, i)=><section className="pipeline-column" key={stage}><header><div><span className="pipeline-count">{i+1}</span><h2>{stage}</h2></div><strong>{leads.filter(l=>l.stage===stage).length}</strong></header>{leads.filter(l=>l.stage===stage).map(l=><article className="lead-card" key={l.name}><div className="lead-title"><div className="person"><span>{l.name.split(" ").map(n=>n[0]).join("")}</span><div><strong>{l.name}</strong><small>{l.source}</small></div></div><Button variant="ghost" size="icon"><MoreHorizontal /></Button></div><p>{l.interest}</p><div className="lead-value"><span>Potential value</span><strong>{l.value}</strong></div><button className="followup"><Clock3 />{l.next}</button><div className="lead-actions"><Button variant="outline" size="icon" aria-label="Call lead"><Phone /></Button><Button variant="outline"><MessageCircle />WhatsApp</Button></div></article>)}</section>)}</div></>;
}

function TreatmentsView({ onAdd }: { onAdd: () => void }) {
  const rows = [
    ["Ananya Deshmukh","PRP","Session 3 of 6","26 Sep 2026","Improving","Active"], ["Rohan Kulkarni","Transplant","3,200 grafts · Norwood IV","12 Sep 2026","Day 14 recovery","Recovery"], ["Meera Shah","PRP","Session 1 of 4","17 Sep 2026","Baseline","Active"], ["Arjun Sethi","Transplant","2,450 grafts · Norwood III","04 Sep 2026","Good density","Review due"], ["Kavita Rao","PRP","Session 5 of 6","15 Sep 2026","Visible regrowth","Active"],
  ];
  return <><PageHeader title="Treatments" description="PRP courses, transplant procedures and outcome tracking" action="Record treatment" onAction={onAdd} /><div className="metrics-grid compact"><MetricCard label="Active PRP plans" value="64" trend="6 this week" icon={Activity}/><MetricCard label="Transplants this month" value="18" trend="3 planned" icon={Sparkles}/><MetricCard label="Average graft count" value="2,840" trend="4.6%" icon={Zap}/><MetricCard label="Reviews due" value="9" trend="2 overdue" icon={Clock3}/></div><section className="panel"><SectionHeader title="Treatment records" subtitle="Recent sessions and procedures" /><DataTable><thead><tr><th>Patient</th><th>Type</th><th>Plan / procedure</th><th>Last session</th><th>Outcome</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td><StatusChip tone={r[5]==="Active"?"success":r[5]==="Recovery"?"warning":"neutral"}>{r[5]}</StatusChip></td></tr>)}</tbody></DataTable></section></>;
}

function BillingView({ onAdd }: { onAdd: () => void }) {
  return <><PageHeader title="Billing" description="Invoices, payment status and treatment packages" action="Create invoice" onAction={onAdd} /><div className="metrics-grid compact"><MetricCard label="Collected this month" value="₹8.42L" trend="12.4%" icon={CircleDollarSign}/><MetricCard label="Outstanding" value="₹1.26L" trend="8 invoices" icon={Clock3}/><MetricCard label="Packages active" value="94" trend="11 new" icon={ClipboardPlus}/><MetricCard label="Average invoice" value="₹18,420" trend="3.2%" icon={FileText}/></div><section className="panel"><SectionHeader title="Recent invoices" subtitle="September payment activity" trailing={<Button variant="outline"><FileText/>Export</Button>} /><DataTable><thead><tr><th>Invoice</th><th>Patient</th><th>Service</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{[["INV-26091","Rohan Kulkarni","Hair transplant","25 Sep","₹1,05,000","Paid"],["INV-26090","Meera Shah","PRP package · 4","24 Sep","₹18,000","Paid"],["INV-26089","Amit Patil","Consultation","24 Sep","₹800","Pending"],["INV-26088","Kavita Rao","PRP session","23 Sep","₹4,500","Paid"],["INV-26087","Siddharth Jain","Hair analysis","22 Sep","₹1,200","Overdue"]].map(r=><tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><strong>{r[4]}</strong></td><td><StatusChip tone={r[5]==="Paid"?"success":r[5]==="Overdue"?"error":"warning"}>{r[5]}</StatusChip></td></tr>)}</tbody></DataTable></section></>;
}

function ReportsView({ onExport }: { onExport: () => void }) {
  const months = [48,61,55,72,68,82,76,91,84,94,88,98];
  return <><PageHeader title="Reports" description="Revenue, treatment outcomes and clinic performance" action="Export report" onAction={onExport} /><div className="metrics-grid compact"><MetricCard label="Revenue YTD" value="₹82.6L" trend="16.8%" icon={CircleDollarSign}/><MetricCard label="Patient retention" value="78%" trend="4.1%" icon={Users}/><MetricCard label="PRP completion" value="84%" trend="6.2%" icon={Activity}/><MetricCard label="Lead conversion" value="31%" trend="2.8%" icon={BarChart3}/></div><div className="reports-grid"><section className="panel chart-panel"><SectionHeader title="Monthly revenue" subtitle="October 2025 – September 2026" trailing={<StatusChip tone="success">+16.8% YoY</StatusChip>} /><div className="bar-chart">{months.map((h,i)=><div key={i}><span style={{height:`${h}%`}} /><small>{["O","N","D","J","F","M","A","M","J","J","A","S"][i]}</small></div>)}</div></section><section className="panel"><SectionHeader title="Outcome quality" subtitle="Patient-reported at 6 months" /><div className="outcomes">{[["Excellent","62%"],["Good","28%"],["Moderate","8%"],["Needs review","2%"]].map(([l,v])=><div key={l}><div><span>{l}</span><strong>{v}</strong></div><div className="progress-track"><span className="progress-fill" style={{width:v}} /></div></div>)}</div></section></div></>;
}

function SettingsView({ onInvite }: { onInvite: () => void }) {
  return <><PageHeader title="Settings" description="Clinic preferences, team access and role permissions" action="Invite team member" onAction={onInvite} /><div className="settings-layout"><nav className="settings-nav"><button className="active"><UserRound/>Team access</button><button><Settings/>Clinic profile</button><button><Bell/>Notifications</button><button><CreditCard/>Billing settings</button></nav><section className="panel"><SectionHeader title="Team access" subtitle="Manage members and their permissions" /><div className="team-list">{[["DB","Dr. Bhushan Patil","Admin · Lead doctor","Active"],["SD","Dr. Sonal Desai","Doctor","Active"],["PM","Priya More","Reception","Active"],["AK","Ashwini Kale","Reception","Invited"]].map(m=><div className="team-row" key={m[1]}><span className="team-avatar">{m[0]}</span><div><strong>{m[1]}</strong><small>{m[2]}</small></div><StatusChip tone={m[3]==="Active"?"success":"warning"}>{m[3]}</StatusChip><Button variant="ghost" size="icon"><MoreHorizontal/></Button></div>)}</div></section></div></>;
}

function ActionModal({ open, onOpenChange, kind, onSuccess }: { open: boolean; onOpenChange: (v:boolean)=>void; kind: string; onSuccess: (message:string)=>void }) {
  const [saving,setSaving]=useState(false);
  const submit=()=>{setSaving(true);setTimeout(()=>{setSaving(false);onOpenChange(false);onSuccess(`${kind} saved successfully.`)},700)};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{kind}</DialogTitle><DialogDescription>Add the key details now. You can update the complete clinical record later.</DialogDescription></DialogHeader><div className="form-grid"><label>Patient name<input placeholder="Enter full name" /></label><label>Mobile number<input placeholder="+91" /></label><label className="full">Notes<textarea placeholder="Add clinical or follow-up notes" /></label></div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={saving}>{saving?<><LoaderCircle className="animate-spin"/>Saving…</>:<>Save details</>}</Button></DialogFooter></DialogContent></Dialog>;
}

function PatientModal({ open, onOpenChange }: { open:boolean; onOpenChange:(v:boolean)=>void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="patient-dialog"><DialogHeader><div className="profile-heading"><span>AD</span><div><DialogTitle>Ananya Deshmukh</DialogTitle><DialogDescription>PT-1084 · 32 years · +91 98230 78142</DialogDescription></div></div></DialogHeader><div className="profile-summary"><div><span>Primary concern</span><strong>Progressive hair thinning</strong></div><div><span>Current plan</span><strong>PRP · Session 3 of 6</strong></div><div><span>Next appointment</span><strong>17 Oct, 10:30 AM</strong></div></div><Banner tone="success">Treatment response is on track. Density improved by 14% from baseline.</Banner><div className="timeline"><h3>Treatment timeline</h3>{[["Today","PRP Session 3","Completed · No adverse reaction"],["29 Aug","PRP Session 2","Completed · Mild tenderness"],["01 Aug","PRP Session 1","Baseline photos captured"],["24 Jul","Consultation","Treatment plan approved"]].map(x=><div key={x[0]}><span>{x[0]}</span><i/><p><strong>{x[1]}</strong><small>{x[2]}</small></p></div>)}</div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Close</Button><Button>Edit patient record</Button></DialogFooter></DialogContent></Dialog>;
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
      <div className="app-loader-bar"><span /></div>
    </div>
  </div>;
}

function LoadingShowcase() { return <div className="loading-card" aria-label="Loading patient records"><div className="loading-title"><LoaderCircle className="animate-spin"/><span>Refreshing records…</span></div><div className="skeleton-row"><Skeleton className="size-10"/><div><Skeleton className="h-3 w-36"/><Skeleton className="mt-2 h-3 w-24"/></div><Skeleton className="ml-auto h-6 w-16"/></div></div>; }

export function CRMApp() {
  const [view,setView]=useState<View>("Dashboard"); const [mobile,setMobile]=useState(false); const [dark,setDark]=useState(false);
  const [action,setAction]=useState<string|null>(null); const [profile,setProfile]=useState(false); const [notice,setNotice]=useState<string|null>(null); const [notifications,setNotifications]=useState(false); const [globalSearch,setGlobalSearch]=useState(""); const [loading,setLoading]=useState(false);
  const [booting,setBooting]=useState(true); const [overlay,setOverlay]=useState<string|null>(null);
  useEffect(()=>{const isDark=localStorage.getItem("drb-theme")==="dark";setDark(isDark);document.documentElement.classList.toggle("dark",isDark)},[]);
  useEffect(()=>{const justIn=consumeJustLoggedIn();const t=setTimeout(()=>setBooting(false),justIn?3000:1500);return ()=>clearTimeout(t)},[]);
  const nav=useNavigate();
  const handleSignOut=()=>{mockSignOut();nav({to:"/auth",replace:true})};
  const toggleTheme=()=>setDark(v=>{const next=!v;document.documentElement.classList.toggle("dark",next);localStorage.setItem("drb-theme",next?"dark":"light");return next});
  const navigate=(label:View)=>{setLoading(true);setView(label);setMobile(false);setOverlay(`Loading ${label.toLowerCase()}…`);setTimeout(()=>{setLoading(false);setOverlay(null)},900)};
  const title = view;
  const content=useMemo(()=>{const show=(k:string)=>setAction(k); switch(view){case "Dashboard":return <Dashboard onBook={()=>show("Book appointment")} onPatient={()=>setProfile(true)}/>;case "Patients":return <PatientsView onAdd={()=>show("Add patient")} onSelect={()=>setProfile(true)}/>;case "Appointments":return <AppointmentsView onBook={()=>show("Book appointment")}/>;case "Leads":return <LeadsView onAdd={()=>show("Add enquiry")}/>;case "Treatments":return <TreatmentsView onAdd={()=>show("Record treatment")}/>;case "Billing":return <BillingView onAdd={()=>show("Create invoice")}/>;case "Reports":return <ReportsView onExport={()=>{setNotice("Report exported successfully.")}}/>;case "Settings":return <SettingsView onInvite={()=>show("Invite team member")}/>;}},[view]);
  return <div className="app-shell">
    {(booting||overlay)&&<AppLoader label={booting?"Preparing your clinic workspace…":overlay}/>}
    {mobile&&<button className="mobile-overlay" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}
    <aside className={cn("sidebar",mobile&&"mobile-open")}><div className="brand"><div className="brand-mark"><img src={logoMark} alt="Dr. Bhushan’s Rejuvenation logo" width={38} height={38} loading="lazy"/></div><div><strong>Dr. Bhushan’s</strong><span>REJUVENATION</span></div><Button variant="ghost" size="icon" className="mobile-close" onClick={()=>setMobile(false)} aria-label="Close menu"><X/></Button></div><div className="clinic-label">Clinic workspace</div><nav>{navItems.map(item=><button key={item.label} onClick={()=>navigate(item.label)} className={cn(view===item.label&&"active")}><item.icon/><span>{item.label}</span>{view===item.label&&<ChevronRight/>}</button>)}</nav><div className="sidebar-foot"><div className="support"><span><Activity/></span><div><strong>Clinic status</strong><small>All systems operational</small></div></div><p>Dr. Bhushan’s Rejuvenation<br/>Pune, Maharashtra</p></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-left"><Button variant="ghost" size="icon" className="menu-button" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></Button><div><span className="mobile-title">{title}</span></div><label className="global-search"><Search/><input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="Search patients, appointments…"/><kbd>⌘ K</kbd></label></div><div className="top-actions"><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark?"Use light mode":"Use dark mode"}>{dark?<Sun/>:<Moon/>}</Button><DropdownMenu open={notifications} onOpenChange={setNotifications}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="notification-button" aria-label="Notifications"><Bell/><span>3</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="notification-menu"><DropdownMenuLabel>Notifications</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem><span className="menu-icon success"><Check/></span><div><strong>Payment received</strong><small>₹18,000 from Meera Shah</small></div></DropdownMenuItem><DropdownMenuItem><span className="menu-icon warning"><Clock3/></span><div><strong>Follow-up due</strong><small>Nikhil Pawar · today</small></div></DropdownMenuItem><DropdownMenuItem><span className="menu-icon"><CalendarDays/></span><div><strong>Schedule updated</strong><small>2 appointments added</small></div></DropdownMenuItem></DropdownMenuContent></DropdownMenu><div className="top-separator"/><DropdownMenu><DropdownMenuTrigger asChild><button className="profile-trigger"><span>DB</span><div><strong>Dr. Bhushan</strong><small>Administrator</small></div><ChevronDown/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Dr. Bhushan Patil</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem onClick={()=>navigate("Settings")}><Settings/>Settings</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={handleSignOut}><LogOut/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></header>
      <main>{notice&&<Banner tone="success" onClose={()=>setNotice(null)}>{notice}</Banner>}{globalSearch.length>1&&<div className="search-result"><Search/><span>Quick search for <strong>“{globalSearch}”</strong></span><button onClick={()=>{setGlobalSearch("");navigate("Patients")}}>Search patient records<ChevronRight/></button></div>}{loading?<LoadingShowcase/>:content}</main>
    </div>
    <ActionModal open={action!==null} onOpenChange={v=>!v&&setAction(null)} kind={action??"Add record"} onSuccess={setNotice}/><PatientModal open={profile} onOpenChange={setProfile}/>
  </div>;
}
