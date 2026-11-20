import Link from "next/link";
import {
  Check,
  CircleDashed,
  Database,
  ExternalLink,
  KeyRound,
  Mic,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { readiness } from "@/lib/readiness";
import { Button } from "./ui/button";
export function Setup({
  checks,
  error,
  account,
}: {
  checks: ReturnType<typeof readiness>;
  error?: string | null;
  account?: { email: string; role: string; organization: string } | null;
}) {
  return (
    <div className="setup-page">
      <div className="page-heading">
        <div>
          <h1>
            {account
              ? "Setup & account"
              : "A clear path from change to commitment."}
          </h1>
          <p>
            {account
              ? "Your workspace, permissions, and integration readiness."
              : "Connect your workspace to make garment order decisions with confidence."}
          </p>
        </div>
        <span className="badge badge-neutral">Workspace setup</span>
      </div>
      {error && (
        <div className="notice notice-warning" role="alert">
          {error}
        </div>
      )}
      <div className="setup-grid">
        <div>
          <section className="setup-intro">
            <h2>
              One buyer change.
              <br />
              Every consequence, connected.
            </h2>
            <p>
              Check fabric. Compare production slots. Submit a feasible plan for
              approval. Keep the conversation and the facts together.
            </p>
            <div className="workflow-steps">
              <div>
                <span>01</span>
                <b>Understand the order</b>
                <p>Original quantities and approved commitments.</p>
              </div>
              <div>
                <span>02</span>
                <b>Find a feasible plan</b>
                <p>Calculated from your material and capacity.</p>
              </div>
              <div>
                <span>03</span>
                <b>Approve and follow through</b>
                <p>Reserved resources, production tasks, buyer message.</p>
              </div>
            </div>
          </section>
          {account ? (
            <section className="panel account-details">
              <h2>
                <ShieldCheck size={18} />
                Your account
              </h2>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{account.email}</dd>
                </div>
                <div>
                  <dt>Organization</dt>
                  <dd>{account.organization}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{account.role.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              <Button asChild>
                <Link href="/orders">Open orders</Link>
              </Button>
            </section>
          ) : (
            <div className="notice">
              <Database size={18} />
              <div>
                <strong>Your records belong here.</strong>
                <p>
                  Connect Supabase and seed the labelled sample company.
                  Operational screens always read your database.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="setup-main">
          <section className="panel setup-instructions">
            <h2>
              <Terminal size={18} />
              Get the workspace running
            </h2>
            <ol>
              <li>
                Copy <code>.env.example</code> to <code>.env.local</code> and
                add your Supabase credentials.
              </li>
              <li>
                Apply the four SQL files in <code>supabase/migrations</code>, in
                order.
              </li>
              <li>
                Run <code>npm run seed</code>. Save the two generated account
                passwords.
              </li>
              <li>
                Restart the app, then sign in as the merchandiser. Keep the
                production lead in another browser profile.
              </li>
            </ol>
            <div className="button-row">
              <Button asChild>
                <Link href="/sign-in">
                  <KeyRound size={15} />
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                >
                  Supabase console
                  <ExternalLink size={14} />
                </a>
              </Button>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Integration readiness</h2>
              <span className="muted">
                {checks.filter((c) => c.configured).length} / {checks.length}{" "}
                configured
              </span>
            </div>
            <p className="muted small">
              Configuration presence only. Live connectivity is checked when
              used.
            </p>
            <div className="readiness-list">
              {checks.map((c) => (
                <div key={c.name}>
                  {c.configured ? (
                    <Check className="success-text" size={19} />
                  ) : (
                    <CircleDashed size={19} />
                  )}
                  <div>
                    <h3>
                      {c.name}
                      <span
                        className={`badge ${c.configured ? "badge-green" : "badge-neutral"}`}
                      >
                        {c.configured ? "Configured" : "Setup needed"}
                      </span>
                    </h3>
                    <p>{c.description}</p>
                    <details>
                      <summary>Environment variables</summary>
                      <code>{c.keys.join("\n")}</code>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="setup-footnote">
            <Mic size={17} />
            <p>
              Voice is optional for the core workflow. Add Agora, Gemini, and
              Murf credentials when you’re ready to talk through decisions. Full
              instructions are in the repository README.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
