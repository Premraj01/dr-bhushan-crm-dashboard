import { useEffect, useMemo, useState, type ComponentType } from "react";
import { BellRing, CalendarClock, CheckCheck, ChevronRight, Clock3, MessageSquareText, Phone, Search, Send, Smartphone } from "lucide-react";
import { Banner, PageHeader, StatusChip } from "@/components/crm-ui";
import { clinicTimeOf, isUpcoming, useAppointments, type Appointment } from "@/components/appointments/appointments-api";
import { addDays, clinicToday, formatDay, usePatients } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Channel = "WhatsApp" | "SMS" | "Call";
type ReminderActivity = { id: string; patientName: string; channel: Channel; message: string; sentAt: string; appointmentId?: string | undefined };
type Draft = { patientName: string; phone?: string | undefined; appointmentId: string; packageId: string; visit: string; message: string; channel: Channel };
const KEY = "crm-sent-reminders";
const channels: { label: Channel; note: string; icon: ComponentType<{ className?: string }> }[] = [
  { label: "WhatsApp", note: "Automatic message", icon: MessageSquareText },
  { label: "SMS", note: "Automatic text", icon: Smartphone },
  { label: "Call", note: "Create call task", icon: Phone },
];
function loadActivity(): ReminderActivity[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Array<Omit<ReminderActivity, "channel"> & { channel: string }>;
    return saved.filter((item) => channels.some((channel) => channel.label === item.channel)).map((item) => ({ ...item, channel: item.channel as Channel }));
  } catch { return []; }
}
function clinicDate(iso: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso)); }
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function reminderDate(visitDate: string) { return addDays(visitDate, -1); }
function templateFor(a: Pick<Appointment, "patientName" | "type" | "startsAt">) {
  const first = a.patientName.split(" ")[0] ?? a.patientName;
  return `Hi ${first}, this is a reminder for your ${a.type} visit at Dr. Bhushan's Rejuvenation on ${formatDay(clinicDate(a.startsAt))} at ${clinicTimeOf(a.startsAt)}. Please reply to confirm or call us to reschedule.`;
}
function initials(name: string) { return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function automationLabel(visitDate: string, today: string) {
  const days = daysBetween(today, reminderDate(visitDate));
  if (days < 0) return "Ready to send";
  if (days === 0) return "Sends today";
  if (days === 1) return "Sends tomorrow";
  return `Sends in ${days} days`;
}

/** Package visits are queued automatically one day before their booked date. Delivery is mocked. */
export function RemindersView({ onNotice }: { onNotice: (message: string) => void }) {
  const today = clinicToday();
  const horizon = addDays(today, 30);
  const month = today.slice(0, 7);
  const nextMonth = addDays(`${month}-28`, 7).slice(0, 7);
  const a1 = useAppointments({ month });
  const a2 = useAppointments({ month: nextMonth });
  const { data: patients } = usePatients();
  const [activity, setActivity] = useState<ReminderActivity[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => setActivity(loadActivity()), []);
  const packageVisits = useMemo(() => {
    const all = [...(a1.data ?? []), ...(a2.data ?? [])];
    const seen = new Set<string>();
    return all.filter((appointment) => {
      if (seen.has(appointment.id)) return false;
      seen.add(appointment.id);
      return Boolean(appointment.packageId);
    }).filter((appointment) => isUpcoming(appointment) && clinicDate(appointment.startsAt) >= today && clinicDate(appointment.startsAt) <= horizon)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [a1.data, a2.data, horizon, today]);
  const completedIds = new Set(activity.map((item) => item.appointmentId).filter(Boolean));
  const q = query.trim().toLowerCase();
  const scheduled = packageVisits.filter((appointment) => !q || `${appointment.patientName} ${appointment.type} ${appointment.packageId ?? ""}`.toLowerCase().includes(q));
  const log = activity.filter((item) => !q || `${item.patientName} ${item.message} ${item.channel}`.toLowerCase().includes(q));
  const dueToday = packageVisits.filter((appointment) => reminderDate(clinicDate(appointment.startsAt)) <= today && !completedIds.has(appointment.id)).length;
  const queued = packageVisits.filter((appointment) => !completedIds.has(appointment.id)).length;
  const sentToday = activity.filter((item) => clinicDate(item.sentAt) === today).length;
  const loading = a1.isPending || a2.isPending;
  const openFor = (appointment: Appointment) => {
    const patient = patients?.find((item) => item.id === appointment.patientId);
    setDraft({ patientName: appointment.patientName, phone: patient?.phone, appointmentId: appointment.id, packageId: appointment.packageId ?? "Package visit", visit: `${appointment.type} · ${formatDay(clinicDate(appointment.startsAt))}, ${clinicTimeOf(appointment.startsAt)}`, message: templateFor(appointment), channel: "WhatsApp" });
  };
  const record = (item: Omit<ReminderActivity, "id" | "sentAt">) => {
    const next = [{ ...item, id: `RM-${Date.now()}`, sentAt: new Date().toISOString() }, ...activity];
    setActivity(next); localStorage.setItem(KEY, JSON.stringify(next));
  };
  const send = () => {
    if (!draft || !draft.message.trim()) return;
    setSending(true);
    setTimeout(() => {
      record({ patientName: draft.patientName, channel: draft.channel, message: draft.message.trim(), appointmentId: draft.appointmentId });
      const action = draft.channel === "Call" ? "Call task created" : "Reminder sent";
      setSending(false); setDraft(null); setSuccess(`${action} for ${draft.patientName}.`); onNotice(`${action} for ${draft.patientName}.`);
    }, 700);
  };
  const Stat = ({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: ComponentType<{ className?: string }> }) => <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div><strong>{value}</strong><div className="metric-trend"><span className="reminder-note">{note}</span></div></article>;
  return <>
    <PageHeader title="Reminders" description="Automatic reminders for every scheduled package visit" />
    {success && <Banner tone="success" onClose={() => setSuccess(null)}>{success}</Banner>}
    {(a1.isError || a2.isError) && <Banner tone="error">Couldn&apos;t load scheduled package visits. Try again shortly.</Banner>}
    <section className="reminder-automation"><span className="reminder-automation-icon"><BellRing /></span><div><strong>Automatic visit reminders are active</strong><p>Each scheduled package visit is queued one day before its date. Choose WhatsApp, SMS, or a call task when action is needed.</p></div><StatusChip tone="success">Active</StatusChip></section>
    <section className="metrics-grid"><Stat label="Package visits" value={packageVisits.length} note="Next 30 days" icon={CalendarClock} /><Stat label="Due today" value={dueToday} note="Ready for contact" icon={BellRing} /><Stat label="In queue" value={queued} note="Automatic schedule" icon={Clock3} /><Stat label="Contacted today" value={sentToday} note="All channels" icon={CheckCheck} /></section>
    <div className="toolbar reminder-toolbar"><label className="field-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, package, or visit" /></label><div className="reminder-channel-key" aria-label="Available reminder channels">{channels.map(({ label, icon: Icon }) => <span key={label}><Icon />{label}</span>)}</div></div>
    <Tabs defaultValue="scheduled"><TabsList><TabsTrigger value="scheduled">Scheduled ({packageVisits.length})</TabsTrigger><TabsTrigger value="activity">Activity ({activity.length})</TabsTrigger></TabsList>
      <TabsContent value="scheduled"><section className="panel"><header className="reminder-list-head"><div><strong>Upcoming package visits</strong><span>Reminders are prepared from each visit&apos;s scheduled date</span></div><StatusChip tone="info">1 day before</StatusChip></header>{loading ? <div className="reminder-list">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div> : scheduled.length === 0 ? <div className="empty-state"><BellRing /><h3>No package visits scheduled</h3><p>Visits booked from patient packages will appear here automatically.</p></div> : <ul className="reminder-list">{scheduled.map((appointment) => { const visitDate = clinicDate(appointment.startsAt); const done = completedIds.has(appointment.id); return <li key={appointment.id} className={cn("reminder-row", done && "is-done")}><span className="schedule-avatar">{initials(appointment.patientName)}</span><div className="reminder-visit"><strong>{appointment.patientName}</strong><small>{appointment.type} · {appointment.packageId}</small></div><div className="reminder-date"><strong>{formatDay(visitDate)}</strong><small>{clinicTimeOf(appointment.startsAt)}</small></div><div className="reminder-status"><StatusChip tone={done ? "success" : reminderDate(visitDate) <= today ? "warning" : "info"}>{done ? "Contacted" : automationLabel(visitDate, today)}</StatusChip>{!done && <small>Auto · WhatsApp</small>}</div><Button size="icon" variant="ghost" aria-label={`Open reminder for ${appointment.patientName}`} onClick={() => openFor(appointment)}><ChevronRight /></Button></li>; })}</ul>}</section></TabsContent>
      <TabsContent value="activity"><section className="panel">{log.length === 0 ? <div className="empty-state"><Send /><h3>No reminder activity yet</h3><p>Sent messages and call tasks will be listed here.</p></div> : <ul className="reminder-list">{log.map((item) => { const Icon = channels.find((channel) => channel.label === item.channel)?.icon ?? Send; return <li key={item.id} className="reminder-row reminder-sent"><span className="reminder-activity-icon"><Icon /></span><div className="min-w-0"><strong>{item.patientName}</strong><p>{item.message}</p></div><StatusChip tone={item.channel === "Call" ? "warning" : "success"}>{item.channel === "Call" ? "Call task" : item.channel}</StatusChip><small className="reminder-time">{formatDay(clinicDate(item.sentAt))}, {clinicTimeOf(item.sentAt)}</small></li>; })}</ul>}</section></TabsContent>
    </Tabs>
    <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Package visit reminder</DialogTitle><DialogDescription>Review the scheduled visit and choose how to contact the patient.</DialogDescription></DialogHeader>{draft && <div className="grid gap-4"><div className="reminder-patient-summary"><span className="schedule-avatar">{initials(draft.patientName)}</span><div><strong>{draft.patientName}</strong><small>{draft.phone ?? "No phone number recorded"}</small></div><StatusChip tone="info">{draft.packageId}</StatusChip></div><div className="reminder-visit-summary"><CalendarClock /><div><span>Scheduled visit</span><strong>{draft.visit}</strong></div></div><div className="grid gap-1.5 text-xs font-semibold">Contact method<div className="reminder-channels">{channels.map(({ label, note, icon: Icon }) => <Button key={label} type="button" variant="outline" className={cn("reminder-channel", draft.channel === label && "is-active")} onClick={() => setDraft({ ...draft, channel: label })}><Icon /><span>{label}<small>{note}</small></span></Button>)}</div></div><label className="grid gap-1.5 text-xs font-semibold">{draft.channel === "Call" ? "Call notes" : "Message"}<textarea className="reminder-input" rows={4} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /><span className="reminder-note">{draft.channel === "Call" ? "This creates a call task for the clinic team." : `${draft.message.length} characters`}</span></label></div>}<DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={send} disabled={sending || !draft?.message.trim()}>{draft?.channel === "Call" ? <Phone /> : <Send />}{sending ? "Saving…" : draft?.channel === "Call" ? "Create call task" : "Send now"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}