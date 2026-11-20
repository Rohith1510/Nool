export type Role = "merchandiser" | "production_lead";
export type Organization = {
  id: string;
  name: string;
  resource_version: number;
  reference_date: string | null;
  is_sample: boolean;
};
export type Membership = {
  organization_id: string;
  user_id: string;
  role: Role;
  display_name: string;
};
export type Buyer = {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string;
};
export type Order = {
  id: string;
  organization_id: string;
  buyer_id: string;
  reference: string;
  style: string;
  garment_type: string;
  color: string;
  quantity: number;
  completed_quantity: number;
  fabric_id: string;
  consumption_kg: number;
  wastage_bps: number;
  finishing_days: number;
  transit_days: number | null;
  committed_ship_date: string;
  shipment_plan: Shipment[];
  status: string;
  version: number;
  unit_cost_paise: number | null;
};
export type OrderItem = {
  id: string;
  organization_id: string;
  order_id: string;
  size: string;
  quantity: number;
  completed_quantity: number;
};
export type Fabric = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  composition: string;
  gsm: number;
  color: string;
  stock_kg: number;
  cost_per_kg_paise: number | null;
  version: number;
};
export type Reservation = {
  id: string;
  organization_id: string;
  order_id: string;
  fabric_id: string;
  reserved_kg: number;
  consumed_kg: number;
};
export type ProductionLine = {
  id: string;
  organization_id: string;
  name: string;
  compatible_types: string[];
};
export type CapacitySlot = {
  id: string;
  organization_id: string;
  line_id: string;
  work_date: string;
  capacity: number;
  overtime_capacity: number;
  overtime_cost_paise: number | null;
  version: number;
};
export type Allocation = {
  id: string;
  organization_id: string;
  order_id: string;
  slot_id: string;
  quantity: number;
  completed_quantity: number;
  overtime_quantity: number;
};
export type Shipment = {
  quantity: number;
  ship_date: string;
  production_date: string | null;
  delivery_date: string | null;
};
export type PlanAllocation = {
  slot_id: string;
  quantity: number;
  overtime_quantity: number;
};
export type Plan = {
  key: "same_date" | "split" | "later" | "overtime";
  title: string;
  quantity: number;
  requested_ship_date: string;
  shipments: Shipment[];
  allocations: PlanAllocation[];
  material_required_kg: number;
  additional_material_kg: number;
  extra_cost_paise: number | null;
  missing_costs: string[];
  assumptions: string[];
  impact: string[];
  size_split: Record<string, number>;
  completed_quantity: number;
  production_completion: string | null;
};
export type Evaluation = {
  order_id: string;
  order_version: number;
  resource_version: number;
  as_of: string;
  target_quantity: number;
  requested_ship_date: string;
  material: {
    required_kg: number;
    own_reserved_kg: number;
    other_reserved_kg: number;
    available_for_order_kg: number;
    additional_kg: number;
    sufficient: boolean;
  };
  capacity_by_deadline: number;
  constraints: string[];
  conflicts: {
    order_id: string;
    reference: string;
    buyer: string;
    line: string;
    quantity: number;
    ship_date: string;
  }[];
  plans: Plan[];
  inputs: {
    order: Order;
    items: OrderItem[];
    fabric: Fabric;
    reservations: Reservation[];
    slots: CapacitySlot[];
    allocations: Allocation[];
    lines: ProductionLine[];
  };
  size_split: Record<string, number>;
};
export type Proposal = {
  id: string;
  organization_id: string;
  order_id: string;
  created_by: string;
  sequence: number;
  status: "pending" | "approved" | "rejected" | "stale";
  order_version: number;
  resource_version: number;
  requested_ship_date: string;
  target_quantity: number;
  plan: Plan;
  evaluation: Evaluation;
  idempotency_key: string;
  rejection_reason: string | null;
  buyer_message: string | null;
  created_at: string;
  reviewed_at: string | null;
};
export type ProductionTask = {
  id: string;
  organization_id: string;
  order_id: string;
  proposal_id: string;
  slot_id: string;
  title: string;
  quantity: number;
  due_date: string;
  status: "todo" | "in_progress" | "done";
};
export type AuditEvent = {
  id: string;
  organization_id: string;
  order_id: string | null;
  actor_id: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type Workspace = {
  organization: Organization;
  membership: Membership;
  buyers: Buyer[];
  orders: Order[];
  order_items: OrderItem[];
  fabrics: Fabric[];
  material_reservations: Reservation[];
  production_lines: ProductionLine[];
  capacity_slots: CapacitySlot[];
  production_allocations: Allocation[];
  change_proposals: Proposal[];
  production_tasks: ProductionTask[];
  audit_events: AuditEvent[];
};
export type ChangeRequest = {
  order_id: string;
  quantity: number;
  requested_ship_date?: string;
  size_split?: Record<string, number>;
  allow_overtime?: boolean;
};
