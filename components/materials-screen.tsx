"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Boxes, Check, FileUp, Loader2, Plus, X } from "lucide-react";
import { parseStockCsv, type StockRow } from "@/lib/csv";
import { formatKg } from "@/lib/utils";
import { api, useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
export function MaterialsScreen() {
  const { workspace: w, refresh } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null),
    [delta, setDelta] = useState(""),
    [reason, setReason] = useState(""),
    [csv, setCsv] = useState(""),
    [rows, setRows] = useState<StockRow[]>([]),
    [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const key = useRef<string | null>(null);
  const lead = w.membership.role === "production_lead";
  const save = async () => {
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      await api("/api/resources", {
        kind: "stock",
        id: editing,
        delta_kg: Number(delta),
        reason,
        idempotency_key: key.current,
      });
      setSuccess(
        `Stock adjusted. Reference ${key.current}. Recalculate any open order change.`,
      );
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stock adjustment failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Materials</h1>
          <p>The fabric behind every commitment.</p>
        </div>
        {lead && (
          <Button
            variant="outline"
            onClick={() => {
              setImporting(!importing);
              setError("");
              key.current = null;
            }}
          >
            <FileUp size={16} />
            Import stock CSV
          </Button>
        )}
      </div>
      {error && (
        <div className="notice notice-warning" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice notice-success" role="status">
          <Check size={17} />
          {success}
        </div>
      )}
      {importing && (
        <section className="panel import-panel">
          <div className="section-heading">
            <h2>Import stock adjustments</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close import"
              onClick={() => setImporting(false)}
            >
              <X size={17} />
            </Button>
          </div>
          <p className="small muted">
            Up to 100 rows. Positive kg adds stock; negative kg removes it. All
            rows apply in one transaction, with a reason for each adjustment.
          </p>
          <code className="csv-example">
            code,delta_kg,reason
            <br />
            SJ-180-ECR,25.500,Received mill delivery
          </code>
          <label className="file-input">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                key.current = null;
                try {
                  if (file.size > 100000)
                    throw new Error("Use a CSV below 100 KB.");
                  const value = await file.text();
                  setCsv(value);
                  setRows(
                    parseStockCsv(
                      value,
                      w.fabrics.map((f) => f.code),
                    ),
                  );
                } catch (e) {
                  setRows([]);
                  setError(e instanceof Error ? e.message : "Cannot read CSV.");
                }
              }}
            />
          </label>
          {rows.length > 0 && (
            <>
              <div className="table-scroll">
                <table role="table" aria-label="Stock CSV preview">
                  <thead>
                    <tr>
                      <th>CSV row</th>
                      <th>Code</th>
                      <th>Adjustment</th>
                      <th>Reason</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row}>
                        <td data-label="CSV row">{r.row}</td>
                        <td className="mono" data-label="Fabric code">
                          {r.code}
                        </td>
                        <td data-label="Adjustment">
                          {Number.isFinite(r.delta_kg)
                            ? formatKg(r.delta_kg)
                            : "Invalid"}
                        </td>
                        <td data-label="Reason">{r.reason}</td>
                        <td
                          data-label="Validation"
                          className={r.error ? "error-text" : "success-text"}
                        >
                          {r.error ?? "Valid"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                disabled={busy || rows.some((r) => r.error !== null)}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  key.current ??= crypto.randomUUID();
                  try {
                    await api("/api/materials/import", {
                      csv,
                      idempotency_key: key.current,
                    });
                    setSuccess(
                      `${rows.length} stock adjustments imported. Reference ${key.current}.`,
                    );
                    setImporting(false);
                    setRows([]);
                    setCsv("");
                    await refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Import failed. No rows were applied.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <FileUp size={16} />
                )}
                Apply {rows.length} adjustments
              </Button>
            </>
          )}
        </section>
      )}
      {w.fabrics.length ? (
        <div className="materials-list">
          {w.fabrics.map((f) => {
            const reservations = w.material_reservations.filter(
                (r) => r.fabric_id === f.id,
              ),
              reserved = reservations.reduce(
                (sum, r) => sum + Number(r.reserved_kg),
                0,
              );
            return (
              <section className="panel material-panel" key={f.id}>
                <div className="material-header">
                  <span className="fabric-swatch large" aria-hidden="true" />
                  <div>
                    <span className="mono muted small">{f.code}</span>
                    <h2>{f.name}</h2>
                    <p>
                      {f.composition} / {f.gsm} GSM / {f.color}
                    </p>
                  </div>
                  {lead && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(f.id);
                        setDelta("");
                        setReason("");
                        key.current = null;
                        setError("");
                      }}
                    >
                      <Plus size={15} />
                      Adjust stock
                    </Button>
                  )}
                </div>
                <div className="stock-strip">
                  <div>
                    <span>On-hand stock</span>
                    <strong className="mono">{formatKg(f.stock_kg)}</strong>
                  </div>
                  <div>
                    <span>Reserved</span>
                    <strong className="mono">{formatKg(reserved)}</strong>
                  </div>
                  <div>
                    <span>Available, unreserved</span>
                    <strong className="mono success-text">
                      {formatKg(Number(f.stock_kg) - reserved)}
                    </strong>
                  </div>
                </div>
                {reservations.length ? (
                  <details className="reservations-details">
                    <summary>
                      Order reservations ({reservations.length})
                    </summary>
                    {reservations.map((r) => {
                      const order = w.orders.find((o) => o.id === r.order_id)!;
                      return (
                        <div key={r.id}>
                          <Link href={`/orders/${order.id}`}>
                            #{order.reference} /{" "}
                            {
                              w.buyers.find((b) => b.id === order.buyer_id)
                                ?.name
                            }
                          </Link>
                          <span className="mono">
                            {formatKg(r.reserved_kg)} reserved
                          </span>
                          <span className="small muted">
                            {formatKg(r.consumed_kg)} consumed
                          </span>
                        </div>
                      );
                    })}
                  </details>
                ) : (
                  <p className="small muted">
                    No reservations. Alternative material is never substituted
                    without buyer approval.
                  </p>
                )}
                {editing === f.id && (
                  <form
                    className="inline-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                  >
                    <div className="resource-form">
                      <label>
                        Adjustment (kg)
                        <input
                          type="number"
                          step="0.001"
                          required
                          placeholder="e.g. 25.500 or -10"
                          value={delta}
                          onChange={(e) => {
                            setDelta(e.target.value);
                            key.current = null;
                          }}
                        />
                      </label>
                      <label className="reason-field">
                        Reason
                        <input
                          required
                          minLength={3}
                          maxLength={1000}
                          placeholder="Why is the stock changing?"
                          value={reason}
                          onChange={(e) => {
                            setReason(e.target.value);
                            key.current = null;
                          }}
                        />
                      </label>
                      <Button disabled={busy} type="submit">
                        {busy ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Check size={15} />
                        )}
                        Save adjustment
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Boxes size={30} />
          <h2>No fabrics recorded</h2>
          <p>
            Run the explicit sample seed to create material specifications and
            reservations.
          </p>
        </div>
      )}
      <div className="workspace-note">
        <Boxes size={20} />
        <p>
          Stock is remaining on-hand material. Consumed fabric is tracked
          separately. Adjustments cannot reduce stock below active reservations.
        </p>
      </div>
    </div>
  );
}
