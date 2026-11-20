import { z } from "zod";
export const changeSchema = z.object({
  order_id: z.uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  requested_ship_date: z.iso.date().optional(),
  size_split: z
    .record(z.string().min(1).max(20), z.number().int().nonnegative())
    .optional(),
  allow_overtime: z.boolean().optional(),
});
export const proposalSchema = changeSchema.extend({
  plan_key: z.enum(["same_date", "split", "later", "overtime"]),
  order_version: z.number().int().positive(),
  resource_version: z.number().int().positive(),
  idempotency_key: z.uuid(),
  confirmed: z.literal(true),
});
export const adjustmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("capacity"),
    id: z.uuid(),
    capacity: z.number().int().min(0).max(100000),
    overtime_capacity: z.number().int().min(0).max(100000),
    reason: z.string().trim().min(3).max(1000),
    idempotency_key: z.uuid(),
  }),
  z.object({
    kind: z.literal("stock"),
    id: z.uuid(),
    delta_kg: z
      .number()
      .min(-1000000)
      .max(1000000)
      .refine(
        (n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001,
        "Use at most three decimal places",
      ),
    reason: z.string().trim().min(3).max(1000),
    idempotency_key: z.uuid(),
  }),
  z.object({
    kind: z.literal("task"),
    id: z.uuid(),
    status: z.enum(["todo", "in_progress", "done"]),
    reason: z.string().trim().min(3).max(1000),
    idempotency_key: z.uuid(),
  }),
]);
