import { addDays } from "./calculations";
import type { Workspace } from "./domain";
// Explicit sample company, inserted only by npm run seed. Never a UI fallback.
export const sampleIds = {
  org: "10000000-0000-4000-8000-000000000001",
  buyerA: "20000000-0000-4000-8000-000000000001",
  buyerB: "20000000-0000-4000-8000-000000000002",
  orderA: "30000000-0000-4000-8000-000000000001",
  orderB: "30000000-0000-4000-8000-000000000002",
  fabric: "40000000-0000-4000-8000-000000000001",
  alternative: "40000000-0000-4000-8000-000000000002",
  lineA: "50000000-0000-4000-8000-000000000001",
  lineB: "50000000-0000-4000-8000-000000000002",
};
export function sampleWorkspace(
  referenceDate = "2026-11-23",
  merchId = "90000000-0000-4000-8000-000000000001",
): Workspace {
  const id = sampleIds;
  const organization_id = id.org;
  const slotId = (line: number, day: number) =>
    `60000000-0000-4000-8000-${String(line * 100 + day + 10).padStart(12, "0")}`;
  const base = {
    organization_id,
    garment_type: "knit_tshirt",
    color: "Natural ecru",
    consumption_kg: 0.25,
    wastage_bps: 500,
    finishing_days: 2,
    transit_days: null,
    shipment_plan: [],
    status: "in_production",
    version: 1,
    unit_cost_paise: 8500,
    fabric_id: id.fabric,
  };
  const orders = [
    {
      ...base,
      id: id.orderA,
      buyer_id: id.buyerA,
      reference: "1042",
      style: "Everyday crew / ST-042",
      quantity: 500,
      completed_quantity: 200,
      committed_ship_date: addDays(referenceDate, 4),
    },
    {
      ...base,
      id: id.orderB,
      buyer_id: id.buyerB,
      reference: "1048",
      style: "Relaxed crew / ST-048",
      quantity: 300,
      completed_quantity: 0,
      committed_ship_date: addDays(referenceDate, 4),
    },
  ];
  return {
    organization: {
      id: organization_id,
      name: "Threadworks — sample company",
      resource_version: 1,
      reference_date: referenceDate,
      is_sample: true,
    },
    membership: {
      organization_id,
      user_id: merchId,
      role: "merchandiser",
      display_name: "Sample merchandiser",
    },
    buyers: [
      {
        id: id.buyerA,
        organization_id,
        name: "North & Form",
        contact_name: "Alex",
      },
      {
        id: id.buyerB,
        organization_id,
        name: "Studio Common",
        contact_name: "Jamie",
      },
    ],
    orders,
    order_items: orders.flatMap((order, j) =>
      ["S", "M", "L", "XL"].map((size, i) => ({
        id: `70000000-0000-4000-8000-${String(j * 10 + i + 1).padStart(12, "0")}`,
        organization_id,
        order_id: order.id,
        size,
        quantity: j === 0 ? [100, 150, 150, 100][i] : [60, 90, 90, 60][i],
        completed_quantity: j === 0 ? [40, 60, 60, 40][i] : 0,
      })),
    ),
    fabrics: [
      {
        id: id.fabric,
        organization_id,
        code: "SJ-180-ECR",
        name: "Combed cotton single jersey",
        composition: "100% organic cotton",
        gsm: 180,
        color: "Natural ecru",
        stock_kg: 330,
        cost_per_kg_paise: 42000,
        version: 1,
      },
      {
        id: id.alternative,
        organization_id,
        code: "SJ-190-ALT",
        name: "Cotton modal single jersey",
        composition: "60% cotton / 40% modal",
        gsm: 190,
        color: "Oat",
        stock_kg: 150,
        cost_per_kg_paise: null,
        version: 1,
      },
    ],
    material_reservations: [
      {
        id: "80000000-0000-4000-8000-000000000001",
        organization_id,
        order_id: id.orderA,
        fabric_id: id.fabric,
        reserved_kg: 78.75,
        consumed_kg: 52.5,
      },
      {
        id: "80000000-0000-4000-8000-000000000002",
        organization_id,
        order_id: id.orderB,
        fabric_id: id.fabric,
        reserved_kg: 78.75,
        consumed_kg: 0,
      },
    ],
    production_lines: [
      {
        id: id.lineA,
        organization_id,
        name: "Line A",
        compatible_types: ["knit_tshirt"],
      },
      {
        id: id.lineB,
        organization_id,
        name: "Line B",
        compatible_types: ["knit_tshirt"],
      },
    ],
    capacity_slots: [1, 2].flatMap((line) =>
      [-1, 0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((day) => ({
        id: slotId(line, day),
        organization_id,
        line_id: line === 1 ? id.lineA : id.lineB,
        work_date: addDays(referenceDate, day),
        capacity: day === -1 ? 200 : 100,
        overtime_capacity: 50,
        overtime_cost_paise: 2500,
        version: 1,
      })),
    ),
    production_allocations: [
      {
        id: "81000000-0000-4000-8000-000000000001",
        organization_id,
        order_id: id.orderA,
        slot_id: slotId(1, -1),
        quantity: 200,
        completed_quantity: 200,
        overtime_quantity: 0,
      },
      ...[0, 1, 2].flatMap((day) =>
        [1, 2].map((line) => ({
          id: `81000000-0000-4000-8000-${String(day * 10 + line + 1).padStart(12, "0")}`,
          organization_id,
          order_id: line === 1 ? id.orderA : id.orderB,
          slot_id: slotId(line, day),
          quantity: 100,
          completed_quantity: 0,
          overtime_quantity: 0,
        })),
      ),
    ],
    change_proposals: [],
    production_tasks: [],
    audit_events: [],
  };
}
