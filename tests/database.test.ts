import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createDb,
  identity,
  lead,
  merch,
  outsider,
  review,
  seal,
  snapshot,
} from "./db";
import { sampleIds } from "../lib/sample";
test("SQL approval atomically applies plan, preserves completed work and is idempotent", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const before = await snapshot(db);
    const p = await seal(db, before);
    await assert.rejects(review(db, p.id), /permission/);
    await identity(db, lead);
    const approved = await review(db, p.id);
    assert.equal(approved.status, "approved");
    const after = await snapshot(db);
    assert.equal(after.orders[0].quantity, 600);
    assert.equal(after.orders[0].completed_quantity, 200);
    assert.equal(after.orders[0].committed_ship_date, "2026-11-28");
    assert.equal(after.orders[0].version, 2);
    assert.equal(
      after.material_reservations.find((r) => r.order_id === sampleIds.orderA)
        ?.reserved_kg,
      105,
    );
    assert.equal(
      after.material_reservations.find((r) => r.order_id === sampleIds.orderA)
        ?.consumed_kg,
      52.5,
    );
    assert.equal(after.fabrics[0].stock_kg, before.fabrics[0].stock_kg);
    assert.equal(after.production_tasks.length, 4);
    assert.equal(
      after.production_allocations
        .filter((a) => a.order_id === sampleIds.orderB)
        .reduce((s, a) => s + a.quantity, 0),
      300,
    );
    assert.ok(approved.buyer_message?.includes("500 pieces on 2026-11-27"));
    const repeated = await review(db, p.id);
    assert.equal(repeated.id, p.id);
    const final = await snapshot(db);
    assert.equal(final.production_tasks.length, 4);
    assert.equal(
      final.audit_events.filter((e) => e.event_type === "proposal_approved")
        .length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("capacity edits mark evaluated proposals stale and permit recalculation", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const w = await snapshot(db);
    const p = await seal(db, w);
    await identity(db, lead);
    const slot = w.capacity_slots.find(
      (s) => s.line_id === sampleIds.lineB && s.work_date === "2026-11-25",
    )!;
    await db.query(
      "select public.adjust_resources($1,'capacity',$2,$3::jsonb,'Extra trained operators',$4)",
      [
        sampleIds.org,
        slot.id,
        JSON.stringify({ capacity: 200, overtime_capacity: 50 }),
        randomUUID(),
      ],
    );
    const result = await review(db, p.id);
    assert.equal(result.status, "stale");
    assert.match(result.rejection_reason!, /resource version 1 to 2/);
    const live = await snapshot(db);
    assert.equal(live.orders[0].quantity, 500);
    const next = await seal(
      db,
      live,
      sampleIds.orderA,
      600,
      randomUUID(),
      "same_date",
    );
    assert.equal((await review(db, next.id)).status, "approved");
    assert.equal(
      (await snapshot(db)).orders[0].committed_ship_date,
      "2026-11-27",
    );
  } finally {
    await db.close();
  }
});
test("competing approvals cannot claim the same remaining fabric or capacity", async () => {
  const db = await createDb();
  try {
    await db.query("update public.fabrics set stock_kg=183.750 where id=$1", [
      sampleIds.fabric,
    ]);
    await identity(db, merch);
    const w = await snapshot(db);
    const a = await seal(db, w);
    const b = await seal(db, w, sampleIds.orderB, 400);
    await identity(db, lead);
    const results = await Promise.all([review(db, a.id), review(db, b.id)]);
    assert.deepEqual(results.map((p) => p.status).sort(), [
      "approved",
      "stale",
    ]);
    const final = await snapshot(db);
    const reserved = final.material_reservations
      .filter((r) => r.fabric_id === sampleIds.fabric)
      .reduce((s, r) => s + Number(r.reserved_kg), 0);
    assert.ok(reserved <= 183.75);
    for (const slot of final.capacity_slots) {
      const used = final.production_allocations.filter(
        (a) => a.slot_id === slot.id,
      );
      assert.ok(
        used.reduce((s, a) => s + a.quantity - a.overtime_quantity, 0) <=
          slot.capacity,
      );
    }
  } finally {
    await db.close();
  }
});
test("failed review and failed CSV import roll back all writes", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const w = await snapshot(db);
    const p = await seal(db, w);
    await db.query("update public.fabrics set stock_kg=160 where id=$1", [
      sampleIds.fabric,
    ]);
    await identity(db, lead);
    await assert.rejects(review(db, p.id), /Fabric availability/);
    const after = await snapshot(db);
    assert.equal(after.orders[0].quantity, 500);
    assert.equal(after.change_proposals[0].status, "pending");
    assert.equal(after.production_tasks.length, 0);
    const rows = [
      { code: "SJ-180-ECR", delta_kg: 10, reason: "Received stock" },
      { code: "SJ-180-ECR", delta_kg: -1000, reason: "Invalid writeoff" },
    ];
    await assert.rejects(
      db.query("select public.import_stock($1,$2::jsonb,$3)", [
        sampleIds.org,
        JSON.stringify(rows),
        randomUUID(),
      ]),
      /below reserved/,
    );
    assert.equal(
      (await snapshot(db)).fabrics.find((f) => f.id === sampleIds.fabric)!
        .stock_kg,
      160,
    );
  } finally {
    await db.close();
  }
});
test("organization RLS, actor spoofing, and direct proposal writes are denied", async () => {
  const db = await createDb();
  try {
    await identity(db, outsider);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.orders")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.workspace_snapshot($1,$2)", [
        sampleIds.org,
        merch,
      ]),
      /Unauthorized/,
    );
    await assert.rejects(
      db.query("insert into public.change_proposals(id) values($1)", [
        randomUUID(),
      ]),
      /permission/,
    );
    await assert.rejects(
      db.query("select public.seal_proposal($1,$2,$3,'{}','{}',$4)", [
        sampleIds.org,
        merch,
        sampleIds.orderA,
        randomUUID(),
      ]),
      /permission/,
    );
    await db.exec("reset role");
    await identity(db, merch);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.orders")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
test("rejection reasons persist and repeated proposal submission has one reference", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const w = await snapshot(db),
      key = randomUUID();
    const first = await seal(db, w, sampleIds.orderA, 600, key);
    const repeat = await seal(db, w, sampleIds.orderA, 600, key);
    assert.equal(first.id, repeat.id);
    await identity(db, lead);
    await assert.rejects(review(db, first.id, "reject", ""), /reason/);
    const rejected = await review(
      db,
      first.id,
      "reject",
      "Buyer must accept split freight",
    );
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.rejection_reason, "Buyer must accept split freight");
    assert.equal((await snapshot(db)).orders[0].quantity, 500);
  } finally {
    await db.close();
  }
});
test("task completion consumes reserved stock and preserves material accounting", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const p = await seal(db, await snapshot(db));
    await identity(db, lead);
    await review(db, p.id);
    const before = await snapshot(db),
      task = before.production_tasks[0];
    const key = randomUUID();
    await db.query(
      "select public.adjust_resources($1,'task',$2,'{\"status\":\"done\"}','Production checked',$3)",
      [sampleIds.org, task.id, key],
    );
    await db.query(
      "select public.adjust_resources($1,'task',$2,'{\"status\":\"done\"}','Production checked',$3)",
      [sampleIds.org, task.id, key],
    );
    const after = await snapshot(db);
    assert.equal(after.orders[0].completed_quantity, 300);
    const reservation = after.material_reservations.find(
      (r) => r.order_id === sampleIds.orderA,
    )!;
    assert.equal(reservation.reserved_kg, 78.75);
    assert.equal(reservation.consumed_kg, 78.75);
    assert.equal(
      after.fabrics.find((f) => f.id === sampleIds.fabric)!.stock_kg,
      303.75,
    );
    assert.equal(
      after.order_items
        .filter((i) => i.order_id === sampleIds.orderA)
        .reduce((s, i) => s + i.completed_quantity, 0),
      300,
    );
  } finally {
    await db.close();
  }
});
test("completed overtime remains allocated and is not offered twice", async () => {
  const db = await createDb();
  try {
    await identity(db, merch);
    const p = await seal(
      db,
      await snapshot(db),
      sampleIds.orderA,
      600,
      randomUUID(),
      "overtime",
    );
    await identity(db, lead);
    await review(db, p.id);
    const before = await snapshot(db);
    const task = before.production_tasks.find((t) =>
      before.production_allocations.some(
        (a) =>
          a.slot_id === t.slot_id &&
          a.order_id === sampleIds.orderA &&
          a.overtime_quantity > 0,
      ),
    )!;
    await db.query(
      "select public.adjust_resources($1,'task',$2,'{\"status\":\"done\"}','Overtime production checked',$3)",
      [sampleIds.org, task.id, randomUUID()],
    );
    const after = await snapshot(db);
    const completed = after.production_allocations.find(
      (a) => a.slot_id === task.slot_id && a.order_id === sampleIds.orderA,
    )!;
    assert.equal(completed.completed_quantity, task.quantity);
    assert.ok(completed.overtime_quantity > 0);
    const slot = after.capacity_slots.find((s) => s.id === task.slot_id)!;
    assert.ok(
      completed.quantity - completed.overtime_quantity <= slot.capacity,
    );
    assert.ok(completed.overtime_quantity <= slot.overtime_capacity);
  } finally {
    await db.close();
  }
});
