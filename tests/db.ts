import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { sampleIds, sampleWorkspace } from "../lib/sample";
import { evaluateChange } from "../lib/calculations";
import type { Proposal, Workspace } from "../lib/domain";
import { randomUUID } from "node:crypto";
export const merch = "90000000-0000-4000-8000-000000000001",
  lead = "90000000-0000-4000-8000-000000000002",
  outsider = "90000000-0000-4000-8000-000000000003";
export async function createDb() {
  const db = new PGlite();
  await db.exec(
    `create schema auth;create table auth.users(id uuid primary key); create role anon;create role authenticated;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;grant usage on schema auth to authenticated,service_role;insert into auth.users values('${merch}'),('${lead}'),('${outsider}');`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  const w = sampleWorkspace();
  await db.query("select public.seed_sample($1::jsonb,$2::jsonb)", [
    JSON.stringify(w),
    JSON.stringify([
      {
        organization_id: sampleIds.org,
        user_id: merch,
        role: "merchandiser",
        display_name: "Merch",
      },
      {
        organization_id: sampleIds.org,
        user_id: lead,
        role: "production_lead",
        display_name: "Lead",
      },
    ]),
  ]);
  return db;
}
export async function identity(db: PGlite, id: string, role = "authenticated") {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id, role],
  );
}
export async function snapshot(db: PGlite) {
  const r = await db.query<{ w: Workspace }>(
    "select public.workspace_snapshot($1) as w",
    [sampleIds.org],
  );
  return r.rows[0].w;
}
export async function seal(
  db: PGlite,
  w: Workspace,
  orderId = sampleIds.orderA,
  quantity = 600,
  key = randomUUID(),
  planKey = "split",
) {
  const evaluation = evaluateChange(w, {
    order_id: orderId,
    quantity,
    allow_overtime: planKey === "overtime",
  });
  const plan =
    evaluation.plans.find((p) => p.key === planKey) ?? evaluation.plans[0];
  if (!plan) throw new Error("No feasible test plan");
  const r = await db.query<{ p: Proposal }>(
    "select public.seal_proposal($1,$2,$3,$4::jsonb,$5::jsonb,$6) as p",
    [
      sampleIds.org,
      merch,
      orderId,
      JSON.stringify(evaluation),
      JSON.stringify(plan),
      key,
    ],
  );
  return r.rows[0].p;
}
export async function review(
  db: PGlite,
  id: string,
  decision = "approve",
  reason: string | null = null,
) {
  const r = await db.query<{ p: Proposal }>(
    "select public.review_proposal($1,$2,$3) as p",
    [id, decision, reason],
  );
  return r.rows[0].p;
}
