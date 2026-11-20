import type { Evaluation, Workspace } from "./domain";
import { formatKg } from "./utils";
export function describeChanges(
  evaluation: Evaluation,
  workspace: Workspace,
): string[] {
  const changes: string[] = [];
  const old = evaluation.inputs.order,
    current = workspace.orders.find((o) => o.id === old.id);
  if (current && current.version !== old.version)
    changes.push(
      `Order #${old.reference}: ${old.quantity} → ${current.quantity} pieces; ${old.completed_quantity} → ${current.completed_quantity} completed; shipment ${old.committed_ship_date} → ${current.committed_ship_date}.`,
    );
  const fabric = workspace.fabrics.find(
    (f) => f.id === evaluation.inputs.fabric.id,
  );
  if (
    fabric &&
    Number(fabric.stock_kg) !== Number(evaluation.inputs.fabric.stock_kg)
  )
    changes.push(
      `${fabric.code} stock: ${formatKg(evaluation.inputs.fabric.stock_kg)} → ${formatKg(fabric.stock_kg)}.`,
    );
  const otherReserved = workspace.material_reservations
    .filter(
      (r) =>
        r.fabric_id === evaluation.inputs.fabric.id && r.order_id !== old.id,
    )
    .reduce((s, r) => s + Number(r.reserved_kg), 0);
  if (Math.abs(otherReserved - evaluation.material.other_reserved_kg) > 0.0001)
    changes.push(
      `Other orders' fabric reservations: ${formatKg(evaluation.material.other_reserved_kg)} → ${formatKg(otherReserved)}.`,
    );
  for (const slot of evaluation.inputs.slots) {
    const live = workspace.capacity_slots.find((s) => s.id === slot.id);
    const line =
      workspace.production_lines.find((l) => l.id === slot.line_id)?.name ??
      "Production line";
    if (!live)
      changes.push(`${line}, ${slot.work_date}: working slot removed.`);
    else if (
      live.capacity !== slot.capacity ||
      live.overtime_capacity !== slot.overtime_capacity
    )
      changes.push(
        `${line}, ${slot.work_date}: standard capacity ${slot.capacity} → ${live.capacity}; overtime ${slot.overtime_capacity} → ${live.overtime_capacity}.`,
      );
  }
  if (
    !changes.length &&
    workspace.organization.resource_version !== evaluation.resource_version
  )
    changes.push(
      "Another material or production record changed in this organization. All proposals are conservatively rechecked after resource changes.",
    );
  return changes;
}
