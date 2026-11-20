import "server-only";
import { evaluateChange } from "./calculations";
import type { ChangeRequest, Proposal, Workspace } from "./domain";
import { adminClient } from "./supabase/server";

export async function submitProposal(
  workspace: Workspace,
  actor: string,
  request: ChangeRequest & {
    plan_key: string;
    order_version: number;
    resource_version: number;
    idempotency_key: string;
  },
) {
  const admin = adminClient();
  const { data: previous, error: previousError } = await admin
    .from("change_proposals")
    .select("*")
    .eq("organization_id", workspace.organization.id)
    .eq("idempotency_key", request.idempotency_key)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (previous) {
    if (
      previous.created_by !== actor ||
      previous.order_id !== request.order_id ||
      previous.target_quantity !== request.quantity ||
      previous.plan.key !== request.plan_key
    )
      throw new Error("Idempotency key belongs to another request.");
    return previous as Proposal;
  }
  const evaluation = evaluateChange(workspace, request);
  if (
    evaluation.order_version !== request.order_version ||
    evaluation.resource_version !== request.resource_version
  )
    throw new Error(
      "Order or resources changed. Recalculate before submitting.",
    );
  const plan = evaluation.plans.find((p) => p.key === request.plan_key);
  if (!plan) throw new Error("That plan is no longer feasible. Recalculate.");
  const { data, error } = await admin.rpc("seal_proposal", {
    p_org: workspace.organization.id,
    p_actor: actor,
    p_order: request.order_id,
    p_evaluation: evaluation,
    p_plan: plan,
    p_key: request.idempotency_key,
  });
  if (error) throw new Error(error.message);
  return data as Proposal;
}
