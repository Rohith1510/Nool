import type {
  ChangeRequest,
  Evaluation,
  OrderItem,
  Plan,
  PlanAllocation,
  Shipment,
  Workspace,
} from "./domain";

// All material arithmetic is in integer grams. Round a requirement UP, never down.
export function requiredGrams(
  quantity: number,
  consumptionKg: number,
  wastageBps: number,
): number {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    !Number.isFinite(consumptionKg) ||
    consumptionKg < 0 ||
    !Number.isInteger(wastageBps) ||
    wastageBps < 0
  )
    throw new Error("Invalid material inputs.");
  const milligrams = BigInt(Math.round(consumptionKg * 1_000_000));
  const numerator = BigInt(quantity) * milligrams * BigInt(10_000 + wastageBps);
  return Number((numerator + BigInt(9_999_999)) / BigInt(10_000_000));
}
export const grams = (kg: number) => Math.round(Number(kg) * 1000);
export const addDays = (date: string, days: number) => {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export function planningDate(workspace: Workspace) {
  return (
    workspace.organization.reference_date ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  );
}

export function scaleSizes(
  items: OrderItem[],
  quantity: number,
): Record<string, number> {
  const completed = items.reduce(
    (sum, item) => sum + item.completed_quantity,
    0,
  );
  if (quantity < completed)
    throw new Error(`Quantity cannot be below ${completed} completed pieces.`);
  const weights = items.map((item) =>
    Math.max(0, item.quantity - item.completed_quantity),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (!items.length)
    throw new Error("Add a size split before evaluating this order.");
  const values = items.map((item, i) => ({
    size: item.size,
    quantity:
      item.completed_quantity +
      Math.floor(
        (quantity - completed) *
          (total ? weights[i] / total : 1 / items.length),
      ),
    fraction:
      ((quantity - completed) *
        (total ? weights[i] / total : 1 / items.length)) %
      1,
  }));
  let left = quantity - values.reduce((sum, item) => sum + item.quantity, 0);
  for (const item of [...values].sort(
    (a, b) => b.fraction - a.fraction || a.size.localeCompare(b.size),
  )) {
    if (left-- > 0) item.quantity++;
  }
  return Object.fromEntries(values.map((item) => [item.size, item.quantity]));
}

export function evaluateChange(
  workspace: Workspace,
  request: ChangeRequest,
): Evaluation {
  const order = workspace.orders.find((item) => item.id === request.order_id);
  if (!order) throw new Error("Order not found in your organization.");
  if (
    !Number.isInteger(request.quantity) ||
    request.quantity < Math.max(1, order.completed_quantity) ||
    request.quantity > 1_000_000
  )
    throw new Error(
      "Enter a whole quantity at or above completed production, up to 1,000,000 pieces.",
    );
  const asOf = planningDate(workspace);
  const shipDate = request.requested_ship_date ?? order.committed_ship_date;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(shipDate) ||
    !Number.isFinite(Date.parse(shipDate)) ||
    shipDate < asOf
  )
    throw new Error(
      "Requested shipment must be on or after the planning date.",
    );
  const items = workspace.order_items.filter(
    (item) => item.order_id === order.id,
  );
  const sizeSplit = request.size_split ?? scaleSizes(items, request.quantity);
  if (
    Object.values(sizeSplit).some(
      (value) => !Number.isInteger(value) || value < 0,
    ) ||
    Object.values(sizeSplit).reduce((a, b) => a + b, 0) !== request.quantity ||
    items.some(
      (item) =>
        !(item.size in sizeSplit) ||
        sizeSplit[item.size] < item.completed_quantity,
    ) ||
    Object.keys(sizeSplit).some(
      (size) => !items.some((item) => item.size === size),
    )
  )
    throw new Error(
      "Size split must match the total and preserve completed pieces in every size.",
    );
  const fabric = workspace.fabrics.find((item) => item.id === order.fabric_id);
  if (!fabric) throw new Error("The order's fabric is missing.");
  const reservations = workspace.material_reservations.filter(
    (item) => item.fabric_id === fabric.id,
  );
  const own = reservations
    .filter((item) => item.order_id === order.id)
    .reduce((sum, item) => sum + grams(item.reserved_kg), 0);
  const other = reservations
    .filter((item) => item.order_id !== order.id)
    .reduce((sum, item) => sum + grams(item.reserved_kg), 0);
  const remaining = request.quantity - order.completed_quantity;
  const required = requiredGrams(
    remaining,
    Number(order.consumption_kg),
    order.wastage_bps,
  );
  const additional = Math.max(0, required - own);
  const available = Math.max(0, grams(fabric.stock_kg) - other);
  const compatible = workspace.production_lines.filter((line) =>
    line.compatible_types.includes(order.garment_type),
  );
  const slots = workspace.capacity_slots
    .filter(
      (slot) =>
        compatible.some((line) => line.id === slot.line_id) &&
        slot.work_date >= asOf,
    )
    .sort(
      (a, b) =>
        a.work_date.localeCompare(b.work_date) ||
        a.line_id.localeCompare(b.line_id),
    );
  const constraints: string[] = [];
  if (required > available)
    constraints.push(
      `Fabric shortfall: ${((required - available) / 1000).toFixed(3)} kg. Replenish stock before proposing this quantity.`,
    );
  if (
    workspace.production_allocations.some(
      (a) =>
        a.order_id === order.id &&
        a.quantity > a.completed_quantity &&
        workspace.capacity_slots.some(
          (s) => s.id === a.slot_id && s.work_date < asOf,
        ),
    )
  )
    constraints.push(
      "Unfinished allocations exist before the planning date. Update their dated capacity before recalculating.",
    );
  const free = (slot: (typeof slots)[number], overtime: boolean) => {
    const allocations = workspace.production_allocations.filter(
      (a) => a.slot_id === slot.id,
    );
    const standardUsed = allocations.reduce(
      (sum, a) =>
        sum +
        (a.order_id === order.id
          ? Math.min(a.completed_quantity, a.quantity - a.overtime_quantity)
          : a.quantity - a.overtime_quantity),
      0,
    );
    const overtimeUsed = allocations.reduce(
      (sum, a) =>
        sum +
        (a.order_id === order.id
          ? Math.max(
              0,
              a.completed_quantity - (a.quantity - a.overtime_quantity),
            )
          : a.overtime_quantity),
      0,
    );
    return {
      standard: Math.max(0, slot.capacity - standardUsed),
      overtime: overtime
        ? Math.max(0, slot.overtime_capacity - overtimeUsed)
        : 0,
    };
  };
  const completedReady = addDays(asOf, order.finishing_days);
  const byDeadline =
    (completedReady <= shipDate ? order.completed_quantity : 0) +
    slots
      .filter((s) => addDays(s.work_date, order.finishing_days) <= shipDate)
      .reduce((sum, s) => sum + free(s, false).standard, 0);
  if (byDeadline < request.quantity)
    constraints.push(
      `Standard capacity supports ${Math.min(request.quantity, byDeadline)} of ${request.quantity} pieces by ${shipDate}, including finishing.`,
    );
  const conflicts: Evaluation["conflicts"] = [];
  for (const line of compatible) {
    const grouped = new Map<string, number>();
    for (const allocation of workspace.production_allocations.filter(
      (a) =>
        a.order_id !== order.id &&
        slots.some(
          (s) =>
            s.id === a.slot_id &&
            s.line_id === line.id &&
            addDays(s.work_date, order.finishing_days) <= shipDate,
        ),
    ))
      grouped.set(
        allocation.order_id,
        (grouped.get(allocation.order_id) ?? 0) + allocation.quantity,
      );
    for (const [orderId, quantity] of grouped) {
      const otherOrder = workspace.orders.find((o) => o.id === orderId)!;
      conflicts.push({
        order_id: orderId,
        reference: otherOrder.reference,
        buyer:
          workspace.buyers.find((b) => b.id === otherOrder.buyer_id)?.name ??
          "Other buyer",
        line: line.name,
        quantity,
        ship_date: otherOrder.committed_ship_date,
      });
    }
  }
  const schedule = (
    overtime: boolean,
    deadline?: string,
  ): PlanAllocation[] | null => {
    if (deadline && order.completed_quantity > 0 && completedReady > deadline)
      return null;
    let left = remaining;
    const allocations: PlanAllocation[] = [];
    for (const slot of slots) {
      if (deadline && addDays(slot.work_date, order.finishing_days) > deadline)
        continue;
      const capacity = free(slot, overtime);
      const quantity = Math.min(left, capacity.standard + capacity.overtime);
      if (quantity > 0) {
        allocations.push({
          slot_id: slot.id,
          quantity,
          overtime_quantity: Math.max(0, quantity - capacity.standard),
        });
        left -= quantity;
      }
      if (left === 0) break;
    }
    return left === 0 ? allocations : null;
  };
  const makePlan = (
    key: Plan["key"],
    title: string,
    allocations: PlanAllocation[],
    split: boolean,
  ): Plan => {
    const completion = allocations.length
      ? slots.find((s) => s.id === allocations.at(-1)!.slot_id)!.work_date
      : null;
    const finalShip = completion
      ? [asOf, addDays(completion, order.finishing_days)].sort().at(-1)!
      : addDays(asOf, order.finishing_days);
    let shipments: Shipment[];
    if (split) {
      const onTime =
        order.completed_quantity +
        allocations
          .filter(
            (a) =>
              addDays(
                slots.find((s) => s.id === a.slot_id)!.work_date,
                order.finishing_days,
              ) <= shipDate,
          )
          .reduce((sum, a) => sum + a.quantity, 0);
      shipments = [
        {
          quantity: onTime,
          ship_date: shipDate,
          production_date: addDays(shipDate, -order.finishing_days),
          delivery_date:
            order.transit_days === null
              ? null
              : addDays(shipDate, order.transit_days),
        },
        {
          quantity: request.quantity - onTime,
          ship_date: finalShip,
          production_date: completion,
          delivery_date:
            order.transit_days === null
              ? null
              : addDays(finalShip, order.transit_days),
        },
      ];
    } else {
      const date =
        key === "same_date" || key === "overtime" ? shipDate : finalShip;
      shipments = [
        {
          quantity: request.quantity,
          ship_date: date,
          production_date: completion,
          delivery_date:
            order.transit_days === null
              ? null
              : addDays(date, order.transit_days),
        },
      ];
    }
    const missing: string[] = [];
    if (additional && fabric.cost_per_kg_paise === null)
      missing.push("Fabric cost per kg");
    const delta = Math.max(0, request.quantity - order.quantity);
    if (delta && order.unit_cost_paise === null)
      missing.push("Additional garment conversion cost");
    let cost =
      (BigInt(additional) * BigInt(fabric.cost_per_kg_paise ?? 0) +
        BigInt(999)) /
        BigInt(1000) +
      BigInt(delta) * BigInt(order.unit_cost_paise ?? 0);
    for (const a of allocations.filter((a) => a.overtime_quantity)) {
      const s = slots.find((s) => s.id === a.slot_id)!;
      if (s.overtime_cost_paise === null)
        missing.push("Overtime cost per garment");
      else cost += BigInt(a.overtime_quantity) * BigInt(s.overtime_cost_paise);
    }
    if (split) missing.push("Additional split freight cost");
    if (cost > BigInt(Number.MAX_SAFE_INTEGER))
      missing.push("Cost estimate exceeds supported integer range");
    return {
      key,
      title,
      quantity: request.quantity,
      requested_ship_date: shipDate,
      shipments,
      allocations,
      material_required_kg: required / 1000,
      additional_material_kg: additional / 1000,
      extra_cost_paise: missing.length ? null : Number(cost),
      missing_costs: [...new Set(missing)],
      assumptions: [
        `${order.consumption_kg} kg per garment + ${order.wastage_bps / 100}% wastage; rounded up to 0.001 kg.`,
        `${order.completed_quantity} completed pieces preserved; schedule ${remaining} remaining pieces.`,
        `${order.finishing_days} calendar days for finishing; dated slots define working days.`,
        "Completed pieces are treated as awaiting finishing. Shipment can occur on any calendar day.",
        request.size_split
          ? "Uses your supplied size split."
          : "Size split scaled from remaining quantities; verify before submitting.",
        order.transit_days === null
          ? "Transit not configured; delivery dates unavailable."
          : `${order.transit_days} calendar days transit.`,
      ],
      impact: [
        "Existing allocations for other buyers are preserved.",
        "Alternative fabric requires buyer approval and is not substituted automatically.",
      ],
      size_split: sizeSplit,
      completed_quantity: order.completed_quantity,
      production_completion: completion,
    };
  };
  const plans: Plan[] = [];
  const blocked =
    required > available || constraints.some((c) => c.startsWith("Unfinished"));
  if (!blocked) {
    const same = schedule(false, shipDate);
    if (same)
      plans.push(makePlan("same_date", "Keep the shipment date", same, false));
    const later = schedule(false);
    if (later && !same) {
      if (byDeadline > 0 && byDeadline < request.quantity)
        plans.push(makePlan("split", "Split the shipment", later, true));
      plans.push(makePlan("later", "Ship together, later", later, false));
    }
    if (!later)
      constraints.push(
        "Not enough dated capacity in the planning horizon. Add working slots or capacity and recalculate.",
      );
    if (request.allow_overtime && !same) {
      const overtime = schedule(true, shipDate);
      if (overtime)
        plans.push(
          makePlan("overtime", "Keep the date with overtime", overtime, false),
        );
      else
        constraints.push(
          "Configured overtime is insufficient for the requested date.",
        );
    }
  }
  return {
    order_id: order.id,
    order_version: order.version,
    resource_version: workspace.organization.resource_version,
    as_of: asOf,
    target_quantity: request.quantity,
    requested_ship_date: shipDate,
    material: {
      required_kg: required / 1000,
      own_reserved_kg: own / 1000,
      other_reserved_kg: other / 1000,
      available_for_order_kg: available / 1000,
      additional_kg: additional / 1000,
      sufficient: required <= available,
    },
    capacity_by_deadline: byDeadline,
    constraints,
    conflicts,
    plans,
    inputs: structuredClone({
      order,
      items,
      fabric,
      reservations,
      slots,
      allocations: workspace.production_allocations.filter((a) =>
        slots.some((s) => s.id === a.slot_id),
      ),
      lines: compatible,
    }),
    size_split: sizeSplit,
  };
}
