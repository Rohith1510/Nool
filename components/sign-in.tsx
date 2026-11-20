"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import { Button } from "./ui/button";
export function SignIn({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="signin-layout">
      <div className="signin-copy">
        <span className="thread-rule" />
        <h1>
          Make the next
          <br />
          commitment a clear one.
        </h1>
        <p>
          Your orders, production constraints, and conversations.
          <br />
          One shared place to decide what happens next.
        </p>
        <p className="muted">Nool / Voice AI for garment order decisions.</p>
      </div>
      <section className="panel signin-panel">
        <KeyRound size={25} />
        <h2>Welcome to your workspace</h2>
        <p>Sign in with your organization account.</p>
        {!configured ? (
          <div className="notice notice-warning">
            <p>Connect Supabase before signing in.</p>
            <Button asChild>
              <Link href="/setup">Open setup</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const { error } = await browserClient().auth.signInWithPassword(
                  { email, password },
                );
                if (error) throw error;
                router.push("/orders");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Sign-in failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="form-feedback" aria-live="polite">
              {error && <p className="error-text">{error}</p>}
            </div>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}
        <p className="small muted">
          Using the sample company? Run <code>npm run seed</code> and use the
          generated merchandiser or production lead account.
        </p>
        <Link className="text-link small" href="/setup">
          Setup & integration status
        </Link>
      </section>
    </div>
  );
}
