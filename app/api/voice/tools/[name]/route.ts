import { z } from "zod";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/server";
import { authenticateVoice, updateVoiceState } from "@/lib/voice/session-auth";
import { apiError } from "@/lib/http";
import { evaluateChange } from "@/lib/calculations";
import { changeSchema } from "@/lib/validation";
import { submitProposal } from "@/lib/proposals";
import type { Evaluation, Workspace } from "@/lib/domain";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  let id: string | undefined;
  try {
    const { db, session } = await authenticateVoice(request);
    id = session.id;
    const { name } = await params;
    const input = await request.json();
    const requestKey = z.string().min(1).max(200).parse(input.request_key);
    const names: Record<string, string> = {
      findOrders: "Finding matching orders",
      getOrderContext: "Retrieving order context",
      evaluateOrderChange:
        "Checking fabric availability and comparing production slots",
      selectChangePlan: "Preparing selected plan for confirmation",
      getProposal: "Retrieving proposal",
      createChangeProposal: "Preparing change proposal",
    };
    if (!names[name]) throw new Error("Unknown voice tool.");
    await updateVoiceState(session.id, (state) => ({ ...state, operation: names[name], running: true, at: new Date().toISOString() }));
    await db.from("voice_sessions").update({ last_error: null }).eq("id", id);
    const { data: snapshot, error } = await db.rpc("workspace_snapshot", {
      p_org: session.organization_id,
      p_actor: session.user_id,
    });
    if (error) throw new Error(error.message);
    const w = snapshot as Workspace;
    let result: unknown;
    if (name === "findOrders") {
      const query = z.string().max(200).parse(input.query).toLowerCase();
      result = w.orders
        .filter((o) =>
          `${o.reference} ${w.buyers.find((b) => b.id === o.buyer_id)?.name}`
            .toLowerCase()
            .includes(query),
        )
        .map((o) => ({
          id: o.id,
          reference: o.reference,
          buyer: w.buyers.find((b) => b.id === o.buyer_id)?.name,
          quantity: o.quantity,
          bound_to_this_session: o.id === session.order_id,
        }));
    } else if (name === "getProposal") {
      const proposalId = z.uuid().parse(input.proposal_id);
      result = w.change_proposals.find((p) => p.id === proposalId) ?? {
        error: "Proposal not found in this organization.",
      };
    } else {
      if (z.uuid().parse(input.order_id) !== session.order_id)
        throw new Error(
          "This session is bound to another order. Open the intended order workspace and reconnect.",
        );
      const order = w.orders.find((o) => o.id === session.order_id)!;
      if (name === "getOrderContext")
        result = {
          order,
          buyer: w.buyers.find((b) => b.id === order.buyer_id),
          items: w.order_items.filter((i) => i.order_id === order.id),
          fabric: w.fabrics.find((f) => f.id === order.fabric_id),
          reservations: w.material_reservations.filter(
            (r) => r.fabric_id === order.fabric_id,
          ),
          production_lines: w.production_lines,
          capacity_slots: w.capacity_slots,
          allocations: w.production_allocations,
          other_orders: w.orders
            .filter((o) => o.id !== order.id)
            .map((o) => ({
              id: o.id,
              reference: o.reference,
              buyer: w.buyers.find((b) => b.id === o.buyer_id)?.name,
              committed_ship_date: o.committed_ship_date,
            })),
          resource_version: w.organization.resource_version,
          planning_date: w.organization.reference_date,
        };
      else if (name === "evaluateOrderChange") {
        const sizes = z.string().max(2000).parse(input.sizes_json);
        const evaluation = evaluateChange(
          w,
          changeSchema.parse({
            order_id: input.order_id,
            quantity: input.quantity,
            requested_ship_date: input.requested_ship_date,
            allow_overtime: input.allow_overtime,
            ...(sizes ? { size_split: JSON.parse(sizes) } : {}),
          }),
        );
        const { error: saveError } = await db
          .from("voice_sessions")
          .update({ evaluation, proposal_id: null, selected_plan_key: null })
          .eq("id", id);
        if (saveError) throw new Error(saveError.message);
        result = evaluation;
      } else if (name === "selectChangePlan") {
        const evaluation = session.evaluation as Evaluation | null;
        const plan = evaluation?.plans.find((p) => p.key === input.plan_key);
        if (!plan)
          throw new Error(
            "Evaluate the change and choose a feasible plan first.",
          );
        if (
          evaluation!.order_version !== order.version ||
          evaluation!.resource_version !== w.organization.resource_version
        )
          throw new Error(
            "Records changed. Evaluate the change again before selecting a plan.",
          );
        const { error: saveError } = await db
          .from("voice_sessions")
          .update({ selected_plan_key: plan.key })
          .eq("id", id);
        if (saveError) throw new Error(saveError.message);
        result = { selected_plan: plan, requires_confirmation: true };
      } else if (name === "createChangeProposal") {
        z.literal(true).parse(input.confirmed);
        const evaluation = session.evaluation as Evaluation | null;
        if (!evaluation)
          throw new Error(
            "Evaluate the change first, explain the selected plan and get confirmation.",
          );
        if (session.selected_plan_key !== input.plan_key)
          throw new Error(
            "Call selectChangePlan to show this plan, then obtain explicit confirmation before submitting.",
          );
        const key = createHash("sha256")
          .update(`${id}:${requestKey}`)
          .digest("hex")
          .slice(0, 32)
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        result = await submitProposal(w, session.user_id, {
          order_id: order.id,
          quantity: evaluation.target_quantity,
          requested_ship_date: evaluation.requested_ship_date,
          size_split: evaluation.size_split,
          allow_overtime: input.plan_key === "overtime",
          plan_key: z
            .enum(["same_date", "split", "later", "overtime"])
            .parse(input.plan_key),
          order_version: evaluation.order_version,
          resource_version: evaluation.resource_version,
          idempotency_key: key,
        });
        const { error: saveError } = await db
          .from("voice_sessions")
          .update({ proposal_id: (result as { id: string }).id })
          .eq("id", id);
        if (saveError) throw new Error(saveError.message);
      }
    }
    await updateVoiceState(session.id, (state) => ({ ...state, operation: names[name], running: false, at: new Date().toISOString() }));
    return Response.json({ ok: true, result });
  } catch (e) {
    if (id)
      await adminClient()
        .from("voice_sessions")
        .update({
          last_error: e instanceof Error ? e.message : "Tool failed",

        })
        .eq("id", id);
    if (id) await updateVoiceState(id, (state) => ({ ...state, running: false })).catch(() => {});
    return apiError(e);
  }
}
