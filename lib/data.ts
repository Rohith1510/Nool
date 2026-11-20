import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { databaseConfigured, serverClient } from "./supabase/server";
import type { Workspace } from "./domain";

export async function requireSession() {
  const supabase = await serverClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Sign in to continue.");
  return { supabase, user };
}
export async function sessionWorkspace(orgId?: string) {
  const { supabase, user } = await requireSession();
  let query = supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("organization_id")
    .limit(1);
  if (orgId) query = query.eq("organization_id", orgId);
  const { data: membership, error } = await query.maybeSingle();
  if (error)
    throw new Error(
      "Database is not ready. Apply the migrations, then seed your organization. " +
        error.message,
    );
  if (!membership)
    throw new Error(
      "Your account has no organization. Ask your administrator to add a membership, or run the sample seed command.",
    );
  const { data, error: snapshotError } = await supabase.rpc(
    "workspace_snapshot",
    { p_org: membership.organization_id },
  );
  if (snapshotError) throw new Error(snapshotError.message);
  return { workspace: data as Workspace, supabase, user };
}
export async function pageWorkspace(): Promise<{
  workspace: Workspace | null;
  error: string | null;
}> {
  await connection();
  if (!databaseConfigured()) return { workspace: null, error: null };
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/sign-in");
  try {
    return { workspace: (await sessionWorkspace()).workspace, error: null };
  } catch (error) {
    return {
      workspace: null,
      error:
        error instanceof Error ? error.message : "Unable to load workspace.",
    };
  }
}
