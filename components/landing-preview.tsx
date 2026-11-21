"use client";
import { useState } from "react";
import { Check, PackageCheck, Plus, RotateCcw } from "lucide-react";
import { evaluateChange } from "@/lib/calculations";
import { sampleIds, sampleWorkspace } from "@/lib/sample";
import { CompanyIdentity } from "./company-mark";

export function LandingPreview() {
  const [extraCapacity, setExtraCapacity] = useState(false);
  const workspace = sampleWorkspace();
  if (extraCapacity) {
    const slot = workspace.capacity_slots.find(
      (s) => s.line_id === sampleIds.lineB && s.work_date === "2026-11-25",
    );
    if (slot) slot.capacity += 100;
  }
  const result = evaluateChange(workspace, {
    order_id: sampleIds.orderA,
    quantity: 600,
  });
  const plan = result.plans.find(
    (p) => p.key === (extraCapacity ? "same_date" : "split"),
  );
  return (
    <figure
      className="landing-preview"
      data-slot="shipment-plan"
      aria-label="Interactive sample shipment evaluation"
    >
      <div className="preview-identity">
        <span>
          Order <span className="mono">#1042</span>
        </span>
        <CompanyIdentity name="North & Form" />
      </div>
      <div className="preview-request">
        <span>Buyer requests</span>
        <p>
          <span className="mono">500</span>
          <span className="preview-to">to</span>
          <strong className="mono">600</strong>
          <span>pieces</span>
        </p>
        <span>Same shipment date. More to consider.</span>
      </div>
      <button
        className="preview-capacity"
        type="button"
        aria-pressed={extraCapacity}
        onClick={() => setExtraCapacity((value) => !value)}
      >
        {extraCapacity ? <RotateCcw size={15} /> : <Plus size={15} />}
        <span>
          {extraCapacity
            ? "Restore sample capacity"
            : "Try 100 more pieces of capacity"}
        </span>
      </button>
      <div className="preview-answer">
        <span
          className={`preview-verdict ${extraCapacity ? "is-feasible" : ""}`}
        >
          <PackageCheck size={17} aria-hidden="true" />
          {extraCapacity
            ? "Same-date plan available"
            : "A split shipment is feasible"}
        </span>
        <div className="preview-shipments">
          {plan?.shipments.map((shipment) => (
            <div key={shipment.ship_date}>
              <span className="mono preview-quantity">
                {shipment.quantity}
                <small>pieces</small>
              </span>
              <time dateTime={shipment.ship_date}>
                {new Date(shipment.ship_date + "T12:00:00Z").toLocaleDateString(
                  "en-GB",
                  { month: "short", day: "numeric", timeZone: "UTC" },
                )}
              </time>
              <span>
                {extraCapacity
                  ? "Requested date"
                  : shipment.quantity === 500
                    ? "Original commitment"
                    : "Remaining quantity"}
              </span>
            </div>
          ))}
        </div>
        <p className="preview-fact">
          <Check size={14} aria-hidden="true" />
          Other buyers’ allocations preserved
        </p>
      </div>
      <figcaption>
        Interactive sample. Uses Nool’s calculation rules; no records are
        changed.
      </figcaption>
    </figure>
  );
}
