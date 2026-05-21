"use client";
// ============================================================
// Login page - email/password + magic-link via Supabase Auth.
// useSearchParams is wrapped in a Suspense boundary so Next 14
// can statically generate the page shell.
// ============================================================

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get("next") || "/dashboard";
  const configMissing = search?.get("config") === "missing";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(
    configMissing
      ? "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server."
      : null
  );
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null); setBusy(true);
    try {
      const supabase = supabaseBrowser();
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) throw error;
        setInfo("Magic link sent. Check your email.");
      }
    } catch (e2: any) {
      setErr(e2?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="card card-pad-lg" style={{ width: "100%", maxWidth: 420 }}>
        <div className="row gap-3" style={{ marginBottom: 20 }}>
          <div className="side-brand-logo" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" fill="white" opacity="0.18" />
              <path d="M8 11l3 3 5-5" />
            </svg>
          </div>
          <div>
            <div style={{ font: "var(--t-h2)" }}>Installtec OS</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>CRM & Operations · Sign in</div>
          </div>
        </div>

        <div className="seg seg-block" style={{ marginBottom: 16 }}>
          <button type="button" data-on={String(mode === "password")} onClick={() => setMode("password")}>Password</button>
          <button type="button" data-on={String(mode === "magic")} onClick={() => setMode("magic")}>Magic link</button>
        </div>

        <form onSubmit={submit} className="col gap-3">
          <div>
            <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Email</label>
            <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@installtec.ae" style={{ marginTop: 6 }} />
          </div>
          {mode === "password" && (
            <div>
              <label style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Password</label>
              <div style={{ position: "relative", marginTop: 6 }}>
                <input className="input" type={showPassword ? "text" : "password"} required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", padding: 6, cursor: "pointer",
                    color: "var(--ink-mute)", display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 6,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--ink)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-mute)"}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </button>
              </div>
            </div>
          )}
          {err && (
            <div style={{ padding: "10px 12px", background: "var(--dan-50)", color: "var(--dan-700)", borderRadius: "var(--r-md)", font: "var(--t-small)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="alertCircle" size={14} /> {err}
            </div>
          )}
          {info && (
            <div style={{ padding: "10px 12px", background: "var(--suc-50)", color: "var(--suc-700)", borderRadius: "var(--r-md)", font: "var(--t-small)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="checkCircle" size={14} /> {info}
            </div>
          )}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
            {busy ? <><Icon name="loader" size={14} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</> : (mode === "password" ? "Sign in" : "Email magic link")}
          </button>
        </form>

        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", textAlign: "center", marginTop: 18 }}>
          Need access? Contact your Installtec admin to provision your account.
        </div>
      </div>
    </div>
  );
}
