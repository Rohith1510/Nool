import { Shell } from "@/components/shell";
import { Setup } from "@/components/setup";
import { readiness } from "@/lib/readiness";
import { databaseConfigured, serverClient } from "@/lib/supabase/server";
import { sessionWorkspace } from "@/lib/data";
import { connection } from "next/server";
import { Suspense } from "react";
import Loading from "../(workspace)/loading";
export default function SetupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SetupContent />
    </Suspense>
  );
}
async function SetupContent() {
  await connection();
  let account = null;
  let error = null;
  if (databaseConfigured()) {
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      try {
        const { workspace } = await sessionWorkspace();
        account = {
          email: user.email ?? "",
          role: workspace.membership.role,
          organization: workspace.organization.name,
        };
      } catch (e) {
        error = e instanceof Error ? e.message : "Database not ready";
      }
    }
  }
  return (
    <Shell standalone>
      <Setup checks={readiness()} account={account} error={error} />
    </Shell>
  );
}
