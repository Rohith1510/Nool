"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  History,
  Info,
  Layers3,
  Loader2,
  Package,
  RefreshCw,
  Shirt,
  Truck,
} from "lucide-react";
import type { ChangeRequest, Evaluation, Order, Proposal } from "@/lib/domain";
import { formatDate, formatKg } from "@/lib/utils";
import { planningDate, scaleSizes } from "@/lib/calculations";
import { api, useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
import { PlanView } from "./plan-view";
import { VoicePanel } from "./voice-panel";
export function OrderWorkspace({
  orderId,
  voiceReady,
}: {
  orderId: string;
  voiceReady: boolean;
}) {
  const { workspace } = useWorkspace();
  const order = workspace.orders.find((o) => o.id === orderId);
  if (!order)
    return (
      <div className="empty-state">
        <Shirt size={30} />
        <h1>Order not found</h1>
        <p>This reference may belong to another workspace.</p>
        <Button asChild>
          <Link href="/orders">Back to orders</Link>
        </Button>
      </div>
    );
  return <OrderContent key={order.id} order={order} voiceReady={voiceReady} />;
}
function OrderContent({
  order,
  voiceReady,
}: {
  order: Order;
  voiceReady: boolean;
}) {
  const { workspace: w, refresh } = useWorkspace();
  const params = useSearchParams();
  const previousProposal = w.change_proposals.find(
    (p) => p.id === params.get("proposal") && p.order_id === order.id,
  );
  const [quantity, setQuantity] = useState(
      Number(params.get("quantity")) ||
        order.quantity + (w.organization.is_sample ? 100 : 0),
    ),
    [date, setDate] = useState(
      params.get("requested") ?? order.committed_ship_date,
    ),
    [overtime, setOvertime] = useState(
      previousProposal?.plan.key === "overtime",
    ),
    [customSizes, setCustomSizes] = useState(Boolean(previousProposal)),
    [sizes, setSizes] = useState<Record<string, number>>(
      () =>
        previousProposal?.evaluation.size_split ??
        scaleSizes(
          w.order_items.filter((i) => i.order_id === order.id),
          Number(params.get("quantity")) ||
            order.quantity + (w.organization.is_sample ? 100 : 0),
        ),
    ),
    [evaluation, setEvaluation] = useState<Evaluation | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState<Proposal | null>(null);
  const requestKey = useRef<string | null>(null);
  const autoRan = useRef(false);
  const buyer = w.buyers.find((b) => b.id === order.buyer_id)!;
  const fabric = w.fabrics.find((f) => f.id === order.fabric_id)!;
  const items = w.order_items.filter((i) => i.order_id === order.id);
  const reservation = w.material_reservations.find(
    (r) => r.order_id === order.id && r.fabric_id === order.fabric_id,
  );
  const history = w.audit_events.filter((e) => e.order_id === order.id);
  const stale = Boolean(
    evaluation &&
    (evaluation.order_version !== order.version ||
      evaluation.resource_version !== w.organization.resource_version ||
      evaluation.as_of !== planningDate(w)),
  );
  const plan = evaluation?.plans.find((p) => p.key === selected);
  const changed = () => {
    setEvaluation(null);
    setSelected(null);
    setConfirmed(false);
    setSubmitted(null);
    setError("");
    requestKey.current = null;
  };
  const evaluate = async () => {
    setBusy("evaluate");
    setError("");
    setSubmitted(null);
    setConfirmed(false);
    try {
      const request: ChangeRequest = {
        order_id: order.id,
        quantity,
        requested_ship_date: date,
        allow_overtime: overtime,
        ...(customSizes ? { size_split: sizes } : {}),
      };
      const result = await api<Evaluation>("/api/evaluate", request);
      setEvaluation(result);
      setSelected(null);
      requestKey.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (params.get("recalculate") === "1" && !autoRan.current) {
      autoRan.current = true;
      void evaluate();
    } /* The initial URL is a one-time recalculation intent. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const voiceEvaluation = (result: Evaluation) => {
    if (result.order_id !== order.id) return;
    setEvaluation(result);
    setQuantity(result.target_quantity);
    setDate(result.requested_ship_date);
    setSizes(result.size_split);
    setCustomSizes(true);
    setSelected(null);
    setConfirmed(false);
    requestKey.current = null;
  };
  return (
    <div className="order-workspace">
      <div className="breadcrumb">
        <Link href="/orders">
          <ArrowLeft size={14} />
          Orders
        </Link>
        <ChevronRight size={12} />
        <span className="mono">#{order.reference}</span>
      </div>
      <div className="order-heading">
        <div className="order-identity">
          <span className="garment-icon">
            <Shirt size={28} strokeWidth={1.3} />
          </span>
          <div>
            <h1>{buyer.name}</h1>
            <div className="order-heading-meta">
              <span className="mono">Order #{order.reference}</span>
              <span className="badge badge-neutral">
                {order.status.replaceAll("_", " ")}
              </span>
            </div>
            <p>
              {order.style}
              <span className="separator">/</span>
              {order.color}
            </p>
          </div>
        </div>
        <div className="commitment">
          <span>
            <Truck size={15} />
            Approved shipment commitment
          </span>
          <strong className="mono">
            {formatDate(order.committed_ship_date)}{" "}
            <small>{order.committed_ship_date.slice(0, 4)}</small>
          </strong>
          <span>
            {order.quantity} pieces
            {order.shipment_plan.length > 1
              ? " across split shipments"
              : " in full"}
          </span>
        </div>
      </div>
      <div className="workspace-grid">
        <aside className="order-context">
          <section className="context-section">
            <h2>Current order</h2>
            <dl className="context-facts">
              <div>
                <dt>Order quantity</dt>
                <dd className="mono large-value">
                  {order.quantity}
                  <small> pcs</small>
                </dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd className="mono">{order.completed_quantity} pcs</dd>
              </div>
            </dl>
            <progress
              value={order.completed_quantity}
              max={order.quantity}
              aria-label="Completed garments"
            />
            <p className="small muted">
              {order.quantity - order.completed_quantity} pieces remaining in
              production
            </p>
            <div className="size-grid">
              {items.map((i) => (
                <div key={i.size}>
                  <span>{i.size}</span>
                  <strong className="mono">{i.quantity}</strong>
                </div>
              ))}
            </div>
            <details className="small">
              <summary>Completed by size</summary>
              <p>
                {items
                  .map((i) => `${i.size}: ${i.completed_quantity}`)
                  .join(" / ")}
              </p>
            </details>
          </section>
          <section className="context-section">
            <h2>Material</h2>
            <div className="fabric-chip">
              <span className="fabric-swatch" aria-hidden="true" />
              <div>
                <strong>{fabric.name}</strong>
                <span className="mono small">{fabric.code}</span>
              </div>
            </div>
            <p className="small muted">
              {fabric.composition}
              <br />
              {fabric.gsm} GSM / {fabric.color}
            </p>
            <dl className="mini-facts">
              <div>
                <dt>Reserved for this order</dt>
                <dd className="mono">
                  {formatKg(reservation?.reserved_kg ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Already consumed</dt>
                <dd className="mono">
                  {formatKg(reservation?.consumed_kg ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Per garment</dt>
                <dd className="mono">{order.consumption_kg} kg</dd>
              </div>
              <div>
                <dt>Wastage</dt>
                <dd className="mono">{order.wastage_bps / 100}%</dd>
              </div>
            </dl>
            <Link className="text-link small" href="/materials">
              Inspect stock & reservations
            </Link>
          </section>
          <section className="context-section">
            <h2>Production context</h2>
            <dl className="mini-facts">
              <div>
                <dt>Finishing lead time</dt>
                <dd>{order.finishing_days} calendar days</dd>
              </div>
              <div>
                <dt>Transit</dt>
                <dd>
                  {order.transit_days === null
                    ? "Not configured"
                    : `${order.transit_days} days`}
                </dd>
              </div>
            </dl>
            <div className="allocation-list">
              {w.production_allocations
                .filter(
                  (a) =>
                    a.order_id === order.id &&
                    a.quantity > a.completed_quantity,
                )
                .map((a) => {
                  const s = w.capacity_slots.find((s) => s.id === a.slot_id)!;
                  return (
                    <div key={a.id}>
                      <span>
                        {
                          w.production_lines.find((l) => l.id === s.line_id)
                            ?.name
                        }
                        <small className="mono">
                          {formatDate(s.work_date)}
                        </small>
                      </span>
                      <strong className="mono">
                        {a.quantity - a.completed_quantity}
                        <small> pcs</small>
                      </strong>
                    </div>
                  );
                })}
            </div>
            <Link className="text-link small" href="/production">
              Inspect production capacity
            </Link>
          </section>
          <div className="record-version mono">
            Order v{order.version} / Resources v
            {w.organization.resource_version}
            <br />
            Planning date {planningDate(w)}
          </div>
        </aside>
        <div className="decision-column">
          <section className="change-section">
            <div className="section-heading">
              <h2>
                <RefreshCw size={17} />
                What does the buyer need?
              </h2>
              <span className="badge badge-indigo">Proposed change</span>
            </div>
            <p className="muted">
              Check what you can commit to before changing the order.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void evaluate();
              }}
            >
              <div className="change-form-row">
                <label>
                  Requested quantity
                  <div className="unit-input">
                    <input
                      type="number"
                      required
                      min={Math.max(1, order.completed_quantity)}
                      max={1000000}
                      value={quantity}
                      onChange={(e) => {
                        changed();
                        setQuantity(Number(e.target.value));
                      }}
                    />
                    <span>pieces</span>
                  </div>
                </label>
                <label>
                  Requested shipment
                  <input
                    type="date"
                    min={planningDate(w)}
                    required
                    value={date}
                    onChange={(e) => {
                      changed();
                      setDate(e.target.value);
                    }}
                  />
                </label>
              </div>
              <div className="change-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={overtime}
                    onChange={(e) => {
                      changed();
                      setOvertime(e.target.checked);
                    }}
                  />
                  Include configured overtime
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={customSizes}
                    onChange={(e) => {
                      changed();
                      setCustomSizes(e.target.checked);
                      if (
                        e.target.checked &&
                        quantity >= order.completed_quantity
                      )
                        setSizes(scaleSizes(items, quantity));
                    }}
                  />
                  Specify size split
                </label>
              </div>
              {customSizes && (
                <div className="size-edit-grid">
                  {items.map((item) => (
                    <label key={item.size}>
                      {item.size}
                      <input
                        type="number"
                        min={item.completed_quantity}
                        value={sizes[item.size] ?? 0}
                        onChange={(e) => {
                          changed();
                          setSizes({
                            ...sizes,
                            [item.size]: Number(e.target.value),
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="evaluate-row">
                <span className="small muted">
                  {quantity - order.quantity >= 0 ? "+" : ""}
                  {quantity - order.quantity} pieces from current order
                </span>
                <Button
                  type="submit"
                  disabled={Boolean(busy)}
                  aria-busy={busy === "evaluate"}
                >
                  {busy === "evaluate" ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Layers3 size={16} />
                  )}
                  Evaluate change
                </Button>
              </div>
            </form>
          </section>
          <div className="form-feedback" aria-live="polite">
            {busy === "evaluate" && (
              <p className="progress-message">
                <Loader2 size={15} className="spin" />
                Checking fabric availability and comparing production slots…
              </p>
            )}
            {error && (
              <div className="notice notice-warning" role="alert">
                <AlertTriangle size={17} />
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void evaluate()}
                >
                  Recalculate
                </Button>
              </div>
            )}
          </div>
          {submitted ? (
            <div className="notice notice-success">
              <FileCheck2 size={22} />
              <div>
                <h2>Proposal #{submitted.sequence} submitted</h2>
                <p>
                  Production approval is next. The order commitment changes only
                  after approval.
                </p>
                <code>{submitted.id}</code>
                <p>
                  <Link
                    className="text-link"
                    href={`/approvals?proposal=${submitted.id}`}
                  >
                    Review the persisted proposal
                  </Link>
                </p>
              </div>
            </div>
          ) : null}
          {evaluation ? (
            <section className="evaluation-section">
              <div className="section-heading">
                <h2>Feasible plans</h2>
                <span className="small muted">
                  {stale ? "Recalculation needed" : "Calculated estimates"}
                </span>
              </div>
              {stale && (
                <div className="notice notice-warning">
                  <RefreshCw size={17} />
                  <div>
                    <strong>Resources changed since this calculation.</strong>
                    <p>
                      Order v{evaluation.order_version} / resources v
                      {evaluation.resource_version} was evaluated. Current: v
                      {order.version} / v{w.organization.resource_version}.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void evaluate()}
                    >
                      Recalculate from live records
                    </Button>
                  </div>
                </div>
              )}
              {evaluation.constraints.map((c) => (
                <div className="constraint-line" key={c}>
                  <AlertTriangle size={15} />
                  <p>{c}</p>
                </div>
              ))}
              <div className="material-result">
                <Check size={15} />
                <span>
                  {evaluation.material.sufficient
                    ? `${formatKg(evaluation.material.additional_kg)} additional fabric available`
                    : `Fabric requirement ${formatKg(evaluation.material.required_kg)}`}
                </span>
                <details>
                  <summary>Show calculation</summary>
                  <p>
                    {quantity - order.completed_quantity} remaining ×{" "}
                    {order.consumption_kg} kg ×{" "}
                    {(1 + order.wastage_bps / 10000).toFixed(2)} ={" "}
                    {formatKg(evaluation.material.required_kg)}. Own
                    reservation: {formatKg(evaluation.material.own_reserved_kg)}
                    . Stock after other orders’ reservations:{" "}
                    {formatKg(evaluation.material.available_for_order_kg)}.
                  </p>
                </details>
              </div>
              {evaluation.plans.length ? (
                <div className="plans-grid">
                  {evaluation.plans.map((p) => (
                    <PlanView
                      key={p.key}
                      plan={p}
                      workspace={w}
                      selected={p.key === selected}
                      onSelect={() => {
                        setSelected(p.key);
                        setConfirmed(false);
                        requestKey.current = null;
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">
                  <Package size={26} />
                  <h3>No feasible plan in the current records</h3>
                  <p>Adjust material or dated capacity, then evaluate again.</p>
                </div>
              )}
              {evaluation.conflicts.length > 0 && (
                <details className="conflict-details" open>
                  <summary>
                    <Info size={16} />
                    Could another line help?
                  </summary>
                  {evaluation.conflicts.map((c) => (
                    <p key={c.order_id + c.line}>
                      <strong>{c.line}</strong> has {c.quantity} pieces
                      allocated to{" "}
                      <Link href={`/orders/${c.order_id}`}>
                        #{c.reference} / {c.buyer}
                      </Link>
                      , committed for {formatDate(c.ship_date)}. Moving this
                      work would put that commitment at risk. These plans
                      preserve it.
                    </p>
                  ))}
                </details>
              )}
              {plan && (
                <section className="confirmation">
                  <div className="section-heading">
                    <h2>
                      <ClipboardCheck size={18} />
                      Confirm your proposal
                    </h2>
                    <span className="badge badge-amber">Approval required</span>
                  </div>
                  <p>
                    <strong>{plan.title}.</strong> Change #{order.reference}{" "}
                    from {order.quantity} to {plan.quantity} pieces.
                  </p>
                  <div className="confirmation-dates">
                    {plan.shipments.map((s, i) => (
                      <span key={i} className="mono">
                        {s.quantity} pcs / {formatDate(s.ship_date)}
                      </span>
                    ))}
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={stale}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I’ve checked the size split, shipment plan, costs, and
                    assumptions.
                  </label>
                  <Button
                    disabled={!confirmed || stale || Boolean(busy)}
                    aria-busy={busy === "submit"}
                    onClick={async () => {
                      setBusy("submit");
                      setError("");
                      requestKey.current ??= crypto.randomUUID();
                      try {
                        const result = await api<Proposal>("/api/proposals", {
                          order_id: order.id,
                          quantity: evaluation.target_quantity,
                          requested_ship_date: evaluation.requested_ship_date,
                          size_split: evaluation.size_split,
                          allow_overtime: plan.key === "overtime",
                          plan_key: plan.key,
                          order_version: evaluation.order_version,
                          resource_version: evaluation.resource_version,
                          idempotency_key: requestKey.current,
                          confirmed: true,
                        });
                        setSubmitted(result);
                        setConfirmed(false);
                        await refresh();
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Submission failed. Retry with the same selected plan.",
                        );
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {busy === "submit" ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <ClipboardCheck size={16} />
                    )}
                    Submit for production approval
                  </Button>
                  <p className="small muted">
                    Submission stores a versioned proposal. It does not reserve
                    additional resources.
                  </p>
                </section>
              )}
            </section>
          ) : (
            <div className="decision-empty">
              <Layers3 size={32} strokeWidth={1.2} />
              <h2>Find the plan behind the promise.</h2>
              <p>
                Enter the buyer’s change or start a conversation. Nool checks
                material, production capacity, and finishing time against your
                records.
              </p>
              <div>
                <span>
                  <Package size={15} />
                  Fabric availability
                </span>
                <span>
                  <Clock3 size={15} />
                  Production slots
                </span>
                <span>
                  <Truck size={15} />
                  Shipment readiness
                </span>
              </div>
            </div>
          )}
          {order.shipment_plan.length > 0 && (
            <section className="history-section">
              <h2>
                <Truck size={17} />
                Approved shipment plan
              </h2>
              <div className="approved-shipments">
                {order.shipment_plan.map((s, i) => (
                  <div key={i}>
                    <span className="badge badge-green">Approved</span>
                    <strong className="mono">{s.quantity} pieces</strong>
                    <time className="mono">{formatDate(s.ship_date)}</time>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="history-section">
            <h2>
              <History size={17} />
              Order history
            </h2>
            {history.length ? (
              <ol className="history-list">
                {history.map((e) => (
                  <li key={e.id}>
                    <span>{e.event_type.replaceAll("_", " ")}</span>
                    <time className="mono">{formatDate(e.created_at)}</time>
                    <details>
                      <summary>Recorded details</summary>
                      <pre>{JSON.stringify(e.details, null, 2)}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">
                Changes and approval decisions will appear here.
              </p>
            )}
          </section>
        </div>
        <VoicePanel
          key={order.id}
          order={order}
          ready={voiceReady}
          onEvaluation={voiceEvaluation}
          onPlanSelected={(key) => {
            setSelected(key);
            setConfirmed(false);
            requestKey.current = null;
          }}
          onProposal={(p) => {
            setSubmitted(p);
            void refresh();
          }}
        />
      </div>
    </div>
  );
}
