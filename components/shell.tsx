"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardCheck,
  Layers3,
  LogOut,
  Settings2,
  Shirt,
  AudioLines,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { useWorkspace } from "./workspace-provider";
import { browserClient } from "@/lib/supabase/browser";
export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="threadmark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      nool
      <span className="tamil" lang="ta">
        நூல்
      </span>
    </span>
  );
}
const links = [
  { href: "/orders", name: "Orders", icon: Shirt },
  { href: "/production", name: "Production", icon: Layers3 },
  { href: "/materials", name: "Materials", icon: Boxes },
  { href: "/approvals", name: "Approvals", icon: ClipboardCheck },
];
export function Shell({
  children,
  standalone = false,
}: {
  children: React.ReactNode;
  standalone?: boolean;
}) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/" aria-label="Nool home">
          <Wordmark />
        </Link>
        <nav aria-label="Main navigation">
          {links.map(({ href, name, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path.startsWith(href) ? "page" : undefined}
            >
              <Icon size={16} />
              {name}
            </Link>
          ))}
        </nav>
        <div className="topbar-end">
          <span className="product-descriptor">
            <AudioLines size={15} />
            Voice AI for garment decisions
          </span>
          <Link
            className="icon-link"
            href="/setup"
            aria-label="Setup and account"
          >
            <Settings2 size={19} />
          </Link>
        </div>
      </header>
      {!standalone && <WorkspaceBar />}
      <main id="main" className="main-container">
        {children}
      </main>
      <footer className="app-footer">
        <span>Nool / Decisions, held together.</span>
        <span>Requested. Calculated. Approved.</span>
      </footer>
    </div>
  );
}
function WorkspaceBar() {
  const { workspace, error, live, refresh } = useWorkspace();
  const router = useRouter();
  return (
    <>
      <div className="context-bar">
        <span>
          <span className="company-mark">
            {workspace.organization.name.charAt(0)}
          </span>
          {workspace.organization.name}
          <ChevronDown size={14} />
          {workspace.organization.is_sample && (
            <span className="badge badge-neutral">Sample workspace</span>
          )}
        </span>
        <div>
          <span className="sync-state">
            {live ? "Live updates" : "Refreshes every 30s"}
          </span>
          <span className="role-label">
            {workspace.membership.role === "production_lead"
              ? "Production lead"
              : "Merchandiser"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={async () => {
              await browserClient().auth.signOut();
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut size={15} />
          </Button>
        </div>
      </div>
      {error && (
        <div className="notice notice-warning" role="alert">
          {error}
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Retry
          </Button>
        </div>
      )}
    </>
  );
}
