"use client";
import { CompanyIdentity } from "./company-mark";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  FilePenLine,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import type { Proposal } from "@/lib/domain";
import { formatDate, formatKg } from "@/lib/utils";
import { planningDate } from "@/lib/calculations";
import { describeChanges } from "@/lib/changes";
import { api, useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
import { PlanView } from "./plan-view";
export function ApprovalsScreen() {
  const { workspace: w } = useWorkspace();
  const params = useSearchParams(),
    router = useRouter();
  const filter = params.get("status") ?? "all";
  const proposals = w.change_proposals.filter(
    (p) => filter === "all" || p.status === filter,
  );
  const selected =
    w.change_proposals.find((p) => p.id === params.get("proposal")) ??
    proposals[0];
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Approvals</h1>
          <p>Review the consequence before making the commitment.</p>
        </div>
        <span className="badge badge-neutral">
          {w.membership.role === "production_lead"
            ? "Production lead"
            : "Merchandiser / view & recalculate"}
        </span>
      </div>
      <div className="approval-layout">
        <aside className="proposal-queue">
          <label>
            Proposal status
            <select
              value={filter}
              onChange={(e) => {
                const p = new URLSearchParams();
                p.set("status", e.target.value);
                router.replace(`/approvals?${p}`);
              }}
            >
              <option value="all">All proposals</option>
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="stale">Needs recalculation</option>
            </select>
          </label>
          {proposals.length ? (
            proposals.map((p) => {
              const o = w.orders.find((o) => o.id === p.order_id)!;
              return (
                <Link
                  className={`queue-item ${p.id === selected?.id ? "queue-selected" : ""}`}
                  key={p.id}
                  href={`/approvals?status=${filter}&proposal=${p.id}`}
                >
                  <div>
                    <span className="mono">
                      #{o.reference} / P{p.sequence}
                    </span>
                    <span
                      className={`badge ${p.status === "approved" ? "badge-green" : p.status === "pending" ? "badge-amber" : "badge-neutral"}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <strong>
                    <CompanyIdentity
                      name={
                        w.buyers.find((b) => b.id === o.buyer_id)?.name ??
                        "Unknown buyer"
                      }
                    />
                  </strong>
                  <span className="small">
                    {p.target_quantity} pieces / {p.plan.title}
                  </span>
                  <time className="mono small muted">
                    {formatDate(p.created_at)}
                  </time>
                </Link>
              );
            })
          ) : (
            <p className="small muted queue-empty">
              No proposals for this filter.
            </p>
          )}
        </aside>
        {selected ? (
          <ProposalDetail key={selected.id} proposal={selected} />
        ) : (
          <div className="empty-state">
            <ClipboardCheck size={35} />
            <h2>No change proposals yet</h2>
            <p>
              Evaluate a change in an order workspace and submit a selected
              plan.
            </p>
            <Button asChild>
              <Link href="/orders">Find an order</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
function ProposalDetail({ proposal: p }: { proposal: Proposal }) {
  const { workspace: w, refresh } = useWorkspace();
  const order = w.orders.find((o) => o.id === p.order_id)!;
  const [reason, setReason] = useState(""),
    [rejecting, setRejecting] = useState(false),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [message, setMessage] = useState(p.buyer_message ?? ""),
    [messageDirty, setMessageDirty] = useState(false);
  const displayedMessage = messageDirty
    ? message
    : (p.buyer_message ?? message);
  const lead = w.membership.role === "production_lead";
  const stale =
    p.status === "stale" ||
    (p.status === "pending" &&
      (order.version !== p.order_version ||
        w.organization.resource_version !== p.resource_version ||
        p.evaluation.as_of !== planningDate(w)));
  const original = p.evaluation.inputs.order;
  const changes = stale ? describeChanges(p.evaluation, w) : [];
  const review = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError("");
    setSuccess("");
    try {
      const result = await api<Proposal>(`/api/proposals/${p.id}`, {
        decision,
        reason: decision === "reject" ? reason : undefined,
      });
      if (result.status === "stale")
        setError(result.rejection_reason ?? "Resources changed. Recalculate.");
      else {
        setSuccess(
          result.status === "approved"
            ? "Approved. Order, reservations, allocations, production tasks, and audit history updated together."
            : "Rejected. Reason recorded; order commitments are unchanged.",
        );
        if (result.buyer_message && !messageDirty)
          setMessage(result.buyer_message);
      }
      setConfirming(false);
      setRejecting(false);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Review failed. Retry is safe.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <article className="proposal-detail">
      <div className="section-heading">
        <div>
          <span className="mono muted small">
            Order #{order.reference} / Proposal {p.sequence}
          </span>
          <h2>{p.plan.title}</h2>
        </div>
        <span
          className={`badge ${p.status === "approved" ? "badge-green" : "badge-amber"}`}
        >
          {stale ? "Needs recalculation" : p.status}
        </span>
      </div>
      <p className="reference-line mono">{p.id}</p>
      {error && (
        <div className="notice notice-warning" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice notice-success" role="status">
          <Check size={18} />
          {success}
        </div>
      )}
      <div className="comparison-table">
        <div>
          <span>Commitment</span>
          <span>Original at submission</span>
          <span>Proposed plan</span>
        </div>
        <div>
          <strong>Quantity</strong>
          <span className="mono">{original.quantity} pcs</span>
          <strong className="mono">{p.target_quantity} pcs</strong>
        </div>
        <div>
          <strong>Shipment</strong>
          <span className="mono">
            {formatDate(original.committed_ship_date)}
          </span>
          <div>
            {p.plan.shipments.map((s, i) => (
              <p className="mono" key={i}>
                {s.quantity} pcs / {formatDate(s.ship_date)}
              </p>
            ))}
          </div>
        </div>
        <div>
          <strong>Fabric</strong>
          <span className="mono">
            <span className="cell-secondary">Existing reservation</span>
            {formatKg(p.evaluation.material.own_reserved_kg)}
          </span>
          <strong className="mono">
            <span className="cell-secondary">Proposed requirement</span>
            {formatKg(p.plan.material_required_kg)}
          </strong>
        </div>
      </div>
      <div className="approval-impact">
        <h3>Resource impact</h3>
        <p>
          {formatKg(p.plan.additional_material_kg)} additional fabric.{" "}
          {p.target_quantity - original.completed_quantity} remaining pieces
          scheduled. Completed production and other buyers’ allocations are
          preserved.
        </p>
        <p className="small muted">
          Evaluated order v{p.order_version} / resource v{p.resource_version}.
          Current order v{order.version} / resource v
          {w.organization.resource_version}.
        </p>
      </div>
      <PlanView plan={p.plan} workspace={w} />
      {p.rejection_reason && (
        <div className="notice notice-warning">
          <AlertTriangle size={17} />
          <p>{p.rejection_reason}</p>
        </div>
      )}
      {(p.status === "pending" || p.status === "stale") && (
        <div className="review-actions">
          {stale ? (
            <>
              <h3>Records changed after this proposal was calculated.</h3>
              <p>
                Recalculate to see the current material and production options,
                then submit a new version.
              </p>
              <ul className="change-differences">
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <Button asChild>
                <Link
                  href={`/orders/${order.id}?quantity=${p.target_quantity}&requested=${p.requested_ship_date}&proposal=${p.id}&recalculate=1`}
                >
                  <RefreshCw size={16} />
                  Recalculate in order workspace
                </Link>
              </Button>
            </>
          ) : lead ? (
            <>
              <p className="small muted">
                Approval rechecks availability and applies this plan in one
                transaction.
              </p>
              {!confirming && !rejecting && (
                <div className="button-row">
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => setConfirming(true)}
                  >
                    <Check size={16} />
                    Approve plan
                  </Button>
                  <Button
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => setRejecting(true)}
                  >
                    <X size={16} />
                    Reject with reason
                  </Button>
                </div>
              )}
              {confirming && (
                <div className="confirmation">
                  <h3>Apply this commitment?</h3>
                  <p>
                    Approve {p.target_quantity} pieces with the shipment plan
                    above. Resources will be reserved and production tasks
                    created.
                  </p>
                  <div className="button-row">
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() => void review("approve")}
                    >
                      {busy === "approve" ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                      Confirm approval
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={Boolean(busy)}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {rejecting && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void review("reject");
                  }}
                >
                  <label>
                    Reason for rejection
                    <textarea
                      minLength={3}
                      maxLength={1000}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain what must change before this can be approved."
                    />
                  </label>
                  <div className="button-row">
                    <Button
                      variant="destructive"
                      disabled={Boolean(busy)}
                      type="submit"
                    >
                      {busy === "reject" ? (
                        <Loader2 className="spin" size={16} />
                      ) : null}
                      Confirm rejection
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setRejecting(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="notice">
              <ClipboardCheck size={18} />
              <p>
                A production lead must sign in to approve or reject this
                proposal.
              </p>
            </div>
          )}
        </div>
      )}
      {p.status === "approved" && (
        <section className="buyer-message">
          <h3>
            <FilePenLine size={18} />
            Buyer communication
          </h3>
          <p className="small muted">
            Generated from the applied plan. Edit and save before sharing with
            the buyer.
          </p>
          <label className="sr-only" htmlFor="buyer-message">
            Editable buyer message
          </label>
          <textarea
            id="buyer-message"
            value={displayedMessage}
            onChange={(e) => {
              setMessageDirty(true);
              setMessage(e.target.value);
            }}
            rows={7}
          />
          <div className="button-row">
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy("message");
                setError("");
                try {
                  await api(
                    `/api/proposals/${p.id}`,
                    { message: displayedMessage },
                    "PATCH",
                  );
                  setSuccess("Buyer message saved.");
                  setMessageDirty(false);
                  await refresh();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Message could not be saved.",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              Save message
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(displayedMessage);
                  setSuccess("Buyer message copied.");
                } catch {
                  setError(
                    "Clipboard unavailable. Select and copy the message manually.",
                  );
                }
              }}
            >
              Copy message
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/orders/${order.id}`}>View updated order</Link>
            </Button>
          </div>
        </section>
      )}
    </article>
  );
}
