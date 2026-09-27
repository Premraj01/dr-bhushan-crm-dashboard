import { useEffect, useMemo, useState, type ComponentType } from "react";
import { BellRing, CalendarClock, CheckCheck, Mail, MessageSquareText, Phone, Search, Send, Smartphone } from "lucide-react";
import { Banner, PageHeader, StatusChip } from "@/components/crm-ui";
import { clinicTimeOf, isUpcoming, useAppointments, type Appointment } from "@/components/appointments/appointments-api";
import { addDays, clinicToday, formatDay, usePatients } from "@/components/patients/patients-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Channel = "WhatsApp" | "SMS" | "Email";
type SentReminder = { id: string; patientName: string; channel: Channel; message: string; sentAt: string; appointmentId?: string };
type Draft = { patientId?: string; patientName: string; phone?: string; appointmentId?: string; message: string; channel: Channel };

const KEY = "crm-sent-reminders";
const channels: { label: Channel; icon: ComponentType<{ className?: string }> }[] = [
  { label: "WhatsApp", icon: MessageSquareText }, { label: "SMS", icon: Smartphone }, { label: "Email", icon: Mail },
];

function loadSent(): SentReminder[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SentReminder[]; } catch { return []; }
}

function clinicDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

function templateFor(a: Pick<Appointment, "patientName" | "type" | "startsAt">) {
  const first = a.patientName.split(" ")[0];
  return `Hi ${first}, this is a reminder of your ${a.type} appointment at Dr. Bhushan's Rejuvenation on ${formatDay(clinicDate(a.startsAt))} at ${clinicTimeOf(a.startsAt)}. Reply to confirm or call us to reschedule.`;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/** Reminders: upcoming visits that need a nudge, plus a log of reminders already sent. Sending is mocked. */
export function RemindersView({ onNotice }: { onNotice: (message: string) => void }) {
  const today = clinicToday();
  const month = today.slice(0, 7);
  const nextMonth = addDays(`${month}-28`, 7).slice(0, 7);
  const a1 = useAppointments({ month });
  const a2 = useAppointments({ month: nextMonth });
  const { data: patients } = usePatients();
  const [sent, setSent] = useState<SentReminder[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => setSent(loadSent()), []);

  const horizon = addDays(today, 7);
  const upcoming = useMemo(() => {
    const all = [...(a1.data ?? []), ...(a2.data ?? [])];
    const seen = new Set<string>();
    return all
      .filter((a) => !seen.has(a.id) && seen.add(a.id))
      .filter((a) => isUpcoming(a) && clinicDate(a.startsAt) >= today && clinicDate(a.startsAt) <= horizon)
      .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  }, [a1.data, a2.data, today, horizon]);

  const remindedIds = new Set(sent.map((s) => s.appointmentId).filter(Boolean));
  const q = query.trim().toLowerCase();
  const due = upcoming.filter((a) => !q || `${a.patientName} ${a.type}`.toLowerCase().includes(q));
  const log = sent.filter((s) => !q || `${s.patientName} ${s.message}`.toLowerCase().includes(q));
  const pendingCount = upcoming.filter((a) => !remindedIds.has(a.id)).length;
  const sentToday = sent.filter((s) => clinicDate(s.sentAt) === today).length;
  const loading = a1.isPending || a2.isPending;
  const phoneOf = (id?: string) => patients?.find((p) => p.id === id)?.phone;

  const openFor = (a: Appointment) =>
    setDraft({ patientId: a.patientId, patientName: a.patientName, phone: phoneOf(a.patientId), appointmentId: a.id, message: templateFor(a), channel: "WhatsApp" });

  const record = (items: Omit<SentReminder, "id" | "sentAt">[]) => {
    const now = new Date().toISOString();
    const next = [...items.map((i, n) => ({ ...i, id: `RM-${Date.now()}-${n}`, sentAt: now })), ...sent];
    setSent(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const send = () => {
    if (!draft || !draft.patientName || !draft.message.trim()) return;
    setSending(true);
    setTimeout(() => {
      record([{ patientName: draft.patientName, channel: draft.channel, message: draft.message.trim(), appointmentId: draft.appointmentId }]);
      setSending(false);
      setDraft(null);
      setSuccess(`Reminder sent to ${draft.patientName} via ${draft.channel}.`);
      onNotice(`Reminder sent to ${draft.patientName}.`);
    }, 700);
  };

  const sendAll = () => {
    const targets = upcoming.filter((a) => !remindedIds.has(a.id));
    if (!targets.length) return;
    record(targets.map((a) => ({ patientName: a.patientName, channel: "WhatsApp" as Channel, message: templateFor(a), appointmentId: a.id })));
    setSuccess(`${targets.length} reminder${targets.length === 1 ? "" : "s"} sent via WhatsApp.`);
  };

  const Stat = ({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: ComponentType<{ className?: string }> }) => (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div>
      <strong>{value}</strong>
      <div className="metric-trend"><span className="reminder-note">{note}</span></div>
    </article>
  );

  return (
    <>
      <PageHeader title="Reminders" description="Nudge patients before their visits and keep a record of every message sent." action="New reminder" onAction={() => setDraft({ patientName: "", message: "", channel: "WhatsApp" })} />
      {success && <Banner tone="success" onClose={() => setSuccess(null)}>{success}</Banner>}
      {(a1.isError || a2.isError) && <Banner tone="error">Couldn't load upcoming appointments. Try again shortly.</Banner>}

      <section className="metrics-grid">
        <Stat label="Upcoming in 7 days" value={upcoming.length} note="Booked visits" icon={CalendarClock} />
        <Stat label="Awaiting reminder" value={pendingCount} note="Not yet contacted" icon={BellRing} />
        <Stat label="Sent today" value={sentToday} note="Across all channels" icon={Send} />
        <Stat label="Total sent" value={sent.length} note="All time" icon={CheckCheck} />
      </section>

      <div className="toolbar">
        <label className="field-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient or treatment" /></label>
        <Button variant="outline" onClick={sendAll} disabled={!pendingCount}><Send />Remind all ({pendingCount})</Button>
      </div>

      <Tabs defaultValue="due">
        <TabsList><TabsTrigger value="due">Due soon</TabsTrigger><TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger></TabsList>

        <TabsContent value="due">
          <section className="panel">
            {loading ? (
              <div className="reminder-list">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : due.length === 0 ? (
              <div className="empty-state"><BellRing /><h3>No visits need a reminder</h3><p>Appointments in the next 7 days will show up here.</p></div>
            ) : (
              <ul className="reminder-list">
                {due.map((a) => {
                  const done = remindedIds.has(a.id);
                  return (
                    <li key={a.id} className={cn("reminder-row", done && "is-done")}>
                      <span className="schedule-avatar">{initials(a.patientName)}</span>
                      <div className="min-w-0">
                        <strong>{a.patientName}</strong>
                        <small>{a.type} · {formatDay(clinicDate(a.startsAt))}, {clinicTimeOf(a.startsAt)}</small>
                      </div>
                      <StatusChip tone={done ? "success" : "warning"}>{done ? "Reminded" : "Pending"}</StatusChip>
                      <Button size="sm" variant={done ? "outline" : "default"} onClick={() => openFor(a)}><Send />{done ? "Resend" : "Send"}</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="sent">
          <section className="panel">
            {log.length === 0 ? (
              <div className="empty-state"><Send /><h3>No reminders sent yet</h3><p>Messages you send will be listed here.</p></div>
            ) : (
              <ul className="reminder-list">
                {log.map((s) => (
                  <li key={s.id} className="reminder-row reminder-sent">
                    <span className="schedule-avatar">{initials(s.patientName)}</span>
                    <div className="min-w-0">
                      <strong>{s.patientName}</strong>
                      <p>{s.message}</p>
                    </div>
                    <StatusChip tone="info">{s.channel}</StatusChip>
                    <small className="reminder-time">{formatDay(clinicDate(s.sentAt))}, {clinicTimeOf(s.sentAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send reminder</DialogTitle>
            <DialogDescription>Choose how to reach the patient and review the message.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-xs font-semibold">
                Patient
                {draft.appointmentId ? (
                  <div className="reminder-patient"><strong>{draft.patientName}</strong>{draft.phone && <span><Phone className="size-3" />{draft.phone}</span>}</div>
                ) : (
                  <select className="reminder-input" value={draft.patientId ?? ""} onChange={(e) => {
                    const p = patients?.find((x) => x.id === e.target.value);
                    setDraft({ ...draft, patientId: p?.id, patientName: p?.name ?? "", phone: p?.phone, message: draft.message || (p ? `Hi ${p.name.split(" ")[0]}, ` : "") });
                  }}>
                    <option value="">Select a patient</option>
                    {patients?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </label>
              <div className="grid gap-1.5 text-xs font-semibold">
                Channel
                <div className="reminder-channels">
                  {channels.map(({ label, icon: Icon }) => (
                    <button key={label} type="button" className={cn("reminder-channel", draft.channel === label && "is-active")} onClick={() => setDraft({ ...draft, channel: label })}>
                      <Icon className="size-4" />{label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold">
                Message
                <textarea className="reminder-input" rows={5} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
                <span className="reminder-note">{draft.message.length} characters</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={send} disabled={sending || !draft?.patientName || !draft?.message.trim()}>
              <Send />{sending ? "Sending…" : "Send reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
