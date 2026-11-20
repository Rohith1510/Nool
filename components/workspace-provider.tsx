"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Workspace } from "@/lib/domain";
import { browserClient } from "@/lib/supabase/browser";
const Context = createContext<{
  workspace: Workspace;
  refresh: () => Promise<void>;
  error: string | null;
  live: boolean;
} | null>(null);
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "The operation failed. Please retry.");
  return data as T;
}
export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: Workspace;
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState(initial),
    [error, setError] = useState<string | null>(null),
    [live, setLive] = useState(false);
  const active = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const refresh = useCallback(() => {
    queued.current = true;
    if (active.current) return active.current;
    active.current = (async () => {
      // A write/Realtime event arriving during a read must trigger a new snapshot.
      while (queued.current) {
        queued.current = false;
        try {
          const value = await api<Workspace>(
            "/api/workspace",
            undefined,
            "GET",
          );
          setWorkspace(value);
          setError(null);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Workspace refresh failed.",
          );
        }
      }
    })().finally(() => {
      active.current = null;
    });
    return active.current;
  }, []);

  useEffect(() => {
    const client = browserClient();
    let timeout: ReturnType<typeof setTimeout>;
    const channel = client
      .channel(`workspace-${initial.organization.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${initial.organization.id}`,
        },
        () => {
          clearTimeout(timeout);
          timeout = setTimeout(() => void refresh(), 180);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "change_proposals",
          filter: `organization_id=eq.${initial.organization.id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_events",
          filter: `organization_id=eq.${initial.organization.id}`,
        },
        () => void refresh(),
      )
      .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    const timer = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener("focus", focus);
      void client.removeChannel(channel);
    };
  }, [initial.organization.id, refresh]);
  return (
    <Context.Provider value={{ workspace, refresh, error, live }}>
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace provider missing");
  return context;
}
