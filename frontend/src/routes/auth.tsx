import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck2, ChevronRight, Headset, LoaderCircle, Lock, Mail, ShieldCheck, Sparkles, Stethoscope, UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { demoSignIn, isAuthed, mockSignIn, ROLE_LABELS, type Role } from "@/lib/mock-auth";
import logoMark from "@/assets/logo-mark.png";
import doodle from "@/assets/auth-doodle.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Dr. Bhushan’s Rejuvenation CRM" },
      { name: "description", content: "Sign in or create an account to access the clinical workspace at Dr. Bhushan’s Rejuvenation." },
      { property: "og:title", content: "Sign in — Dr. Bhushan’s Rejuvenation CRM" },
      { property: "og:description", content: "Access the clinic workspace for patients, appointments and treatments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const DEMO_ACCOUNTS: { role: Role; person: string; icon: LucideIcon }[] = [
  { role: "Admin", person: "Dr. Bhushan Patil · full access", icon: ShieldCheck },
  { role: "Doctor", person: "Dr. Sonal Desai · clinical", icon: Stethoscope },
  { role: "Reception", person: "Priya More · front desk", icon: Headset },
];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoRole, setDemoRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthed()) navigate({ to: "/", replace: true });
  }, [navigate]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Mock authentication — no backend, just a short delay.
    setTimeout(() => {
      mockSignIn(mode === "register" && name ? name : "Dr. Bhushan");
      navigate({ to: "/" });
    }, 700);
  };

  const signInAsDemo = async (role: Role) => {
    setError(null);
    setDemoRole(role);
    try {
      await demoSignIn(role);
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo sign-in failed");
      setDemoRole(null);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-brand">
            <span className="auth-brand-mark"><img src={logoMark} alt="Dr. Bhushan’s Rejuvenation logo" width={40} height={40} /></span>
            <div><strong>Dr. Bhushan’s</strong><span>REJUVENATION</span></div>
          </div>

          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "signin"} className={cn(mode === "signin" && "active")} onClick={() => setMode("signin")}>Sign in</button>
            <button role="tab" aria-selected={mode === "register"} className={cn(mode === "register" && "active")} onClick={() => setMode("register")}>Create account</button>
          </div>

          <h1>{mode === "signin" ? "Welcome back" : "Join the clinic workspace"}</h1>
          <p className="auth-sub">{mode === "signin" ? "Sign in to manage patients, appointments and treatments." : "Create your account to start managing the clinic."}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label className="auth-field">
                <span>Full name</span>
                <div className="auth-input"><UserRound /><input required value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Bhushan Patil" autoComplete="name" /></div>
              </label>
            )}
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input"><Mail /><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@clinic.com" autoComplete="email" /></div>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input"><Lock /><input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} /></div>
            </label>
            {mode === "signin" && <button type="button" className="auth-forgot">Forgot password?</button>}
            <Button size="lg" type="submit" disabled={submitting} className="auth-submit">
              {submitting ? "Signing you in…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {mode === "signin" && (
            <>
              <div className="auth-divider"><span>or use a demo account</span></div>
              <div className="demo-logins">
                {DEMO_ACCOUNTS.map(({ role, person, icon: Icon }) => (
                  <button
                    key={role}
                    type="button"
                    className="demo-login"
                    onClick={() => signInAsDemo(role)}
                    disabled={submitting || demoRole !== null}
                    aria-label={`Sign in as ${ROLE_LABELS[role]}`}
                  >
                    <span className={cn("demo-login-icon", `demo-${role.toLowerCase()}`)}><Icon /></span>
                    <span className="demo-login-text"><strong>{ROLE_LABELS[role]}</strong><small>{person}</small></span>
                    {demoRole === role ? <LoaderCircle className="animate-spin" /> : <ChevronRight />}
                  </button>
                ))}
              </div>
              {error && <p className="auth-error" role="alert">{error}</p>}
            </>
          )}

          <p className="auth-note"><Sparkles /> Demo mode — any email and password will work, or pick a role above.</p>
        </div>
      </section>

      <aside className="auth-doodle-panel">
        <img src={doodle} alt="Hand-drawn doodles of hair care, scissors, a calendar and a stethoscope" width={1024} height={1280} loading="lazy" />
        <div className="auth-doodle-caption">
          <span className="auth-doodle-icon"><CalendarCheck2 /></span>
          <h2>Care, organised beautifully.</h2>
          <p>Patients, appointments, treatments and billing — one calm workspace for your clinic.</p>
        </div>
      </aside>
    </div>
  );
}
