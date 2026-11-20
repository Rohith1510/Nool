"use client";
import { Check, PackageCheck, Scissors, Truck } from "lucide-react";
import type { Plan, Workspace } from "@/lib/domain";
import { formatDate, formatKg, formatMoney } from "@/lib/utils";
import { Button } from "./ui/button";
export function PlanView({
  plan,
  workspace,
  selected,
  onSelect,
}: {
  plan: Plan;
  workspace: Workspace;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <article className={`plan-option ${selected ? "plan-selected" : ""}`}>
      <div className="plan-title">
        <span className="plan-icon">
          {plan.key === "split" ? <Scissors size={18} /> : <Truck size={18} />}
        </span>
        <h3>{plan.title}</h3>
        {selected && <Check size={17} className="accent-text" />}
      </div>
      <div className="shipment-rows">
        {plan.shipments.map((s, i) => (
          <div key={i}>
            <strong className="mono">
              {s.quantity}
              <span> pcs</span>
            </strong>
            <span>
              <span className="mono">{formatDate(s.ship_date)}</span>
              <span className="cell-secondary">
                Shipment {plan.shipments.length > 1 ? i + 1 : "readiness"}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="plan-cost">
        <span>Additional cost estimate</span>
        <strong>{formatMoney(plan.extra_cost_paise)}</strong>
      </div>
      {plan.missing_costs.length > 0 && (
        <p className="small muted">
          Missing: {plan.missing_costs.join(", ").toLowerCase()}.
        </p>
      )}
      <dl className="plan-resources">
        <div>
          <dt>Additional fabric</dt>
          <dd className="mono">{formatKg(plan.additional_material_kg)}</dd>
        </div>
        <div>
          <dt>Remaining production</dt>
          <dd className="mono">
            {plan.quantity - plan.completed_quantity} pcs
          </dd>
        </div>
        <div>
          <dt>Production completes</dt>
          <dd className="mono">{formatDate(plan.production_completion)}</dd>
        </div>
      </dl>
      <details className="plan-details">
        <summary>Resources & assumptions</summary>
        <ul>
          {plan.allocations.map((a) => {
            const slot = workspace.capacity_slots.find(
              (s) => s.id === a.slot_id,
            );
            return (
              <li key={a.slot_id}>
                {
                  workspace.production_lines.find((l) => l.id === slot?.line_id)
                    ?.name
                }
                , {formatDate(slot?.work_date)}: {a.quantity} pieces
                {a.overtime_quantity
                  ? ` (${a.overtime_quantity} overtime)`
                  : ""}
              </li>
            );
          })}
        </ul>
        <ul>
          {plan.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <ul>
          {plan.impact.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p>
          Sizes:{" "}
          {Object.entries(plan.size_split)
            .map(([size, q]) => `${size} ${q}`)
            .join(" / ")}
        </p>
      </details>
      {onSelect && (
        <Button
          variant={selected ? "default" : "outline"}
          onClick={onSelect}
          className="select-plan"
          aria-pressed={selected}
        >
          {selected ? <PackageCheck size={16} /> : null}
          {selected ? "Selected plan" : "Select this plan"}
        </Button>
      )}
    </article>
  );
}
