import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { sampleWorkspace } from "../lib/sample";
loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.",
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const reference = process.env.DEMO_REFERENCE_DATE ?? "2026-11-23";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(reference) ||
    new Date(reference + "T00:00:00Z").toISOString().slice(0, 10) !== reference
  )
    throw new Error("DEMO_REFERENCE_DATE must be an ISO date.");
  const data = sampleWorkspace(reference);
  const { data: existing, error: checkError } = await client
    .from("organizations")
    .select("id")
    .eq("id", data.organization.id)
    .maybeSingle();
  if (checkError)
    throw new Error("Apply supabase/migrations first. " + checkError.message);
  if (existing) {
    console.log(
      "Sample company already exists. No records or accounts changed. Sign in with the accounts from the original seed. Use Supabase Auth's password reset if needed.",
    );
    return;
  }
  // Random passwords are output once; no shared credential is committed to the repository.
  const accounts = [];
  for (const [role, email, name] of [
    [
      "merchandiser",
      process.env.DEMO_MERCH_EMAIL ?? "merch@nool.example",
      "Sample merchandiser",
    ],
    [
      "production_lead",
      process.env.DEMO_LEAD_EMAIL ?? "production@nool.example",
      "Sample production lead",
    ],
  ]) {
    const password = randomBytes(18).toString("base64url") + "9a!";
    const { data: userData, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (error || !userData.user)
      throw new Error(
        `Cannot create ${email}. Use unused DEMO_MERCH_EMAIL / DEMO_LEAD_EMAIL addresses if an earlier seed was interrupted. ${error?.message}`,
      );
    accounts.push({
      organization_id: data.organization.id,
      user_id: userData.user.id,
      role,
      display_name: name,
      email,
      password,
    });
  }
  const { error } = await client.rpc("seed_sample", {
    p_workspace: data,
    p_members: accounts.map(
      ({ organization_id, user_id, role, display_name }) => ({
        organization_id,
        user_id,
        role,
        display_name,
      }),
    ),
  });
  if (error) throw new Error(error.message);
  console.log(`Created ${data.organization.name}. Planning date ${reference}.`);
  for (const a of accounts)
    console.log(
      `${a.role}: ${a.email}\nPassword (save securely): ${a.password}\n`,
    );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
