import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateChange, requiredGrams, scaleSizes } from "../lib/calculations";
import { sampleWorkspace, sampleIds } from "../lib/sample";
const evaluate = (quantity = 600) =>
  evaluateChange(sampleWorkspace(), { order_id: sampleIds.orderA, quantity });
test("fabric requirement uses remaining garments, explicit wastage and gram rounding", () => {
  assert.equal(requiredGrams(400, 0.25, 500), 105000);
  assert.equal(requiredGrams(1, 0.333333, 500), 350);
  assert.equal(requiredGrams(0, 0.25, 500), 0);
  assert.throws(() => requiredGrams(-1, 0.25, 500));
});
test("own reservation is reusable; consumed fabric is never reserved again", () => {
  const e = evaluate();
  assert.equal(e.material.required_kg, 105);
  assert.equal(e.material.own_reserved_kg, 78.75);
  assert.equal(e.material.additional_kg, 26.25);
  assert.equal(e.material.available_for_order_kg, 251.25);
  assert.equal(e.material.other_reserved_kg, 78.75);
  assert.ok(e.material.sufficient);
});
test("500 to 600 cannot all ship on original date; split preserves 500 and ships 100 later", () => {
  const e = evaluate();
  assert.equal(e.capacity_by_deadline, 500);
  assert.deepEqual(
    e.plans.map((p) => p.key),
    ["split", "later"],
  );
  const p = e.plans[0];
  assert.deepEqual(
    p.shipments.map((s) => [s.quantity, s.ship_date]),
    [
      [500, "2026-11-27"],
      [100, "2026-11-28"],
    ],
  );
  assert.equal(p.production_completion, "2026-11-26");
  assert.equal(
    p.allocations.reduce((s, a) => s + a.quantity, 0),
    400,
  );
  assert.equal(p.extra_cost_paise, null);
  assert.ok(p.missing_costs.includes("Additional split freight cost"));
  assert.equal(p.shipments[0].delivery_date, null);
});
test("competing line allocation is attributed to its order and buyer", () => {
  const e = evaluate();
  assert.deepEqual(
    e.conflicts.map((c) => [c.reference, c.buyer, c.line, c.quantity]),
    [["1048", "Studio Common", "Line B", 300]],
  );
  assert.ok(
    e.plans.every((p) =>
      p.impact.includes("Existing allocations for other buyers are preserved."),
    ),
  );
});
test("editing dated line capacity changes feasible plans", () => {
  const w = sampleWorkspace();
  w.capacity_slots.find(
    (s) => s.line_id === sampleIds.lineB && s.work_date === "2026-11-25",
  )!.capacity = 200;
  const e = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 });
  assert.ok(e.plans.some((p) => p.key === "same_date"));
  assert.equal(e.capacity_by_deadline, 600);
});
test("short stock blocks proposals without stealing another reservation", () => {
  const w = sampleWorkspace();
  w.fabrics[0].stock_kg = 180;
  const e = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 });
  assert.equal(e.material.sufficient, false);
  assert.equal(e.plans.length, 0);
  assert.match(e.constraints[0], /shortfall/);
});
test("completed quantities and completed sizes are immutable", () => {
  const w = sampleWorkspace();
  assert.throws(
    () => evaluateChange(w, { order_id: sampleIds.orderA, quantity: 199 }),
    /completed/,
  );
  assert.throws(
    () =>
      evaluateChange(w, {
        order_id: sampleIds.orderA,
        quantity: 600,
        size_split: { S: 20, M: 200, L: 200, XL: 180 },
      }),
    /completed/,
  );
  const p = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 200 })
    .plans[0];
  assert.equal(p.allocations.length, 0);
  assert.equal(p.material_required_kg, 0);
  assert.equal(p.completed_quantity, 200);
});
test("proportional sizes use largest remainders with an exact total", () => {
  const w = sampleWorkspace();
  const split = scaleSizes(
    w.order_items.filter((i) => i.order_id === sampleIds.orderA),
    601,
  );
  assert.equal(
    Object.values(split).reduce((a, b) => a + b, 0),
    601,
  );
  assert.deepEqual(
    scaleSizes(
      w.order_items.filter((i) => i.order_id === sampleIds.orderA),
      600,
    ),
    { S: 120, M: 180, L: 180, XL: 120 },
  );
});
test("overtime must be explicitly enabled and costed", () => {
  assert.ok(!evaluate().plans.some((p) => p.key === "overtime"));
  const e = evaluateChange(sampleWorkspace(), {
    order_id: sampleIds.orderA,
    quantity: 600,
    allow_overtime: true,
  });
  const p = e.plans.find((p) => p.key === "overtime")!;
  assert.ok(p);
  assert.equal(p.shipments[0].ship_date, "2026-11-27");
  assert.ok(p.allocations.some((a) => a.overtime_quantity > 0));
  assert.ok(p.extra_cost_paise !== null);
});
test("incompatible lines and unrecorded working days cannot provide capacity", () => {
  const w = sampleWorkspace();
  w.production_lines[1].compatible_types = ["woven_shirt"];
  w.capacity_slots = w.capacity_slots.filter(
    (s) => s.work_date <= "2026-11-25",
  );
  const e = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 });
  assert.equal(e.plans.length, 0);
  assert.ok(e.constraints.some((c) => c.includes("horizon")));
});
test("overdue unfinished work blocks optimistic rescheduling", () => {
  const w = sampleWorkspace();
  w.production_allocations[0].quantity = 201;
  assert.equal(
    evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 }).plans
      .length,
    0,
  );
});
test("configured transit adds delivery separately from finishing and shipment", () => {
  const w = sampleWorkspace();
  w.orders[0].transit_days = 3;
  const e = evaluateChange(w, { order_id: sampleIds.orderA, quantity: 600 });
  assert.equal(e.plans[0].shipments[1].ship_date, "2026-11-28");
  assert.equal(e.plans[0].shipments[1].delivery_date, "2026-12-01");
});
test("completed garments still need finishing before a same-date shipment", () => {
  const w = sampleWorkspace();
  const e = evaluateChange(w, {
    order_id: sampleIds.orderA,
    quantity: 200,
    requested_ship_date: "2026-11-23",
  });
  assert.ok(!e.plans.some((p) => p.key === "same_date"));
  assert.equal(e.plans[0].shipments[0].ship_date, "2026-11-25");
});
