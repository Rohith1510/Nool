"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, Layers3, Loader2, Pencil, X } from "lucide-react";
import { planningDate } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { api, useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
export function ProductionScreen() {
  const { workspace: w, refresh } = useWorkspace();
  const params = useSearchParams(),
    router = useRouter();
  const date = params.get("date") ?? planningDate(w),
    line = params.get("line") ?? "all";
  const [editing, setEditing] = useState<string | null>(null),
    [capacity, setCapacity] = useState(0),
    [ot, setOt] = useState(0),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const key = useRef<string | null>(null);
  const lead = w.membership.role === "production_lead";
  const slots = w.capacity_slots.filter(
    (s) => s.work_date >= date && (line === "all" || s.line_id === line),
  );
  const update = (name: string, value: string) => {
    const p = new URLSearchParams(params);
    p.set(name, value);
    router.replace(`/production?${p}`, { scroll: false });
  };
  const save = async () => {
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const result = await api<{ reference: string }>("/api/resources", {
        kind: "capacity",
        id: editing,
        capacity,
        overtime_capacity: ot,
        reason,
        idempotency_key: key.current,
      });
      setSuccess(
        `Capacity saved. Reference ${result.reference ?? key.current}. Recalculate open proposals against the new capacity.`,
      );
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capacity update failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Production</h1>
          <p>See what’s allocated. Decide what can move.</p>
        </div>
        <span className="badge badge-neutral">
          {lead
            ? "Capacity editing enabled"
            : "View only / production lead can edit"}
        </span>
      </div>
      <div className="notice small">
        <Layers3 size={18} />
        <p>
          Capacity is garments per line per dated working day. Existing buyer
          allocations are protected when capacity changes.
        </p>
      </div>
      {error && (
        <div className="notice notice-warning" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice notice-success" role="status">
          <Check size={16} />
          {success}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Dated capacity</h2>
          <div className="button-row">
            <label className="inline-label">
              <CalendarDays size={16} />
              <input
                aria-label="Capacity from date"
                type="date"
                value={date}
                onChange={(e) => update("date", e.target.value)}
              />
            </label>
            <select
              aria-label="Production line"
              value={line}
              onChange={(e) => update("line", e.target.value)}
            >
              <option value="all">All lines</option>
              {w.production_lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {slots.length ? (
          <div className="table-scroll">
            <table role="table" aria-label="Dated production capacity">
              <thead>
                <tr>
                  <th>Working date / line</th>
                  <th>Capacity</th>
                  <th>Allocated</th>
                  <th>Available</th>
                  <th>Overtime</th>
                  <th>Buyer allocations</th>
                  <th>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const allocations = w.production_allocations.filter(
                    (a) => a.slot_id === s.id,
                  );
                  const used = allocations.reduce(
                    (sum, a) => sum + a.quantity - a.overtime_quantity,
                    0,
                  );
                  const otUsed = allocations.reduce(
                    (sum, a) => sum + a.overtime_quantity,
                    0,
                  );
                  return (
                    <tr key={s.id}>
                      <td data-label="Working date / line">
                        <strong className="mono">
                          {formatDate(s.work_date)}
                        </strong>
                        <span className="cell-secondary">
                          {
                            w.production_lines.find((l) => l.id === s.line_id)
                              ?.name
                          }
                        </span>
                      </td>
                      <td className="mono" data-label="Standard capacity">
                        {s.capacity}
                      </td>
                      <td className="mono" data-label="Allocated">
                        {used}
                      </td>
                      <td
                        data-label="Available standard capacity"
                        className={`mono ${s.capacity - used === 0 ? "amber-text" : "success-text"}`}
                      >
                        {s.capacity - used}
                        <span className="cell-secondary">pieces</span>
                      </td>
                      <td
                        className="mono"
                        data-label="Overtime available / total"
                      >
                        {s.overtime_capacity - otUsed} / {s.overtime_capacity}
                        <span className="cell-secondary">
                          available / total
                        </span>
                      </td>
                      <td data-label="Buyer allocations">
                        {allocations.length ? (
                          allocations.map((a) => {
                            const o = w.orders.find(
                              (o) => o.id === a.order_id,
                            )!;
                            return (
                              <div className="allocation-label" key={a.id}>
                                <Link href={`/orders/${o.id}`}>
                                  #{o.reference}
                                </Link>
                                <span className="mono">
                                  {a.quantity} pcs
                                  {a.completed_quantity
                                    ? ` / ${a.completed_quantity} done`
                                    : ""}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <span className="muted">Unallocated</span>
                        )}
                      </td>
                      <td>
                        {lead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${w.production_lines.find((l) => l.id === s.line_id)?.name} ${s.work_date}`}
                            onClick={() => {
                              setEditing(s.id);
                              setCapacity(s.capacity);
                              setOt(s.overtime_capacity);
                              setReason("");
                              setError("");
                              key.current = null;
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">
            <CalendarDays size={25} />
            <h3>No working slots for this filter</h3>
            <p>
              Choose an earlier date or another line. Working days must be
              recorded as capacity slots.
            </p>
          </div>
        )}
        {editing && (
          <form
            className="inline-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="section-heading">
              <h3>
                Edit capacity /{" "}
                {formatDate(
                  w.capacity_slots.find((s) => s.id === editing)?.work_date,
                )}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancel edit"
                onClick={() => setEditing(null)}
              >
                <X size={17} />
              </Button>
            </div>
            <div className="resource-form">
              <label>
                Standard garments
                <input
                  type="number"
                  min="0"
                  max="100000"
                  required
                  value={capacity}
                  onChange={(e) => {
                    setCapacity(Number(e.target.value));
                    key.current = null;
                  }}
                />
              </label>
              <label>
                Overtime garments
                <input
                  type="number"
                  min="0"
                  max="100000"
                  required
                  value={ot}
                  onChange={(e) => {
                    setOt(Number(e.target.value));
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
                  placeholder="e.g. Additional trained operators available"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    key.current = null;
                  }}
                />
              </label>
              <Button disabled={busy} type="submit">
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Check size={16} />
                )}
                Save capacity
              </Button>
            </div>
          </form>
        )}
      </section>
      <section className="panel tasks-panel">
        <div className="section-heading">
          <h2>Production tasks</h2>
          <span className="small muted">Created from approved plans</span>
        </div>
        {w.production_tasks.length ? (
          <div className="task-list">
            {w.production_tasks.map((task) => (
              <div key={task.id}>
                <div>
                  <Link href={`/orders/${task.order_id}`}>
                    <strong>{task.title}</strong>
                  </Link>
                  <span className="cell-secondary">
                    {
                      w.production_lines.find(
                        (l) =>
                          l.id ===
                          w.capacity_slots.find((s) => s.id === task.slot_id)
                            ?.line_id,
                      )?.name
                    }{" "}
                    / <span className="mono">{formatDate(task.due_date)}</span>
                  </span>
                </div>
                <select
                  aria-label={`Status of ${task.title}`}
                  value={task.status}
                  disabled={!lead || busy || task.status === "done"}
                  onChange={async (e) => {
                    const status = e.target.value;
                    if (
                      status === "done" &&
                      !window.confirm(
                        `Record ${task.quantity} completed pieces? This consumes reserved fabric and cannot be undone.`,
                      )
                    )
                      return;
                    setBusy(true);
                    setError("");
                    try {
                      await api("/api/resources", {
                        kind: "task",
                        id: task.id,
                        status,
                        reason: `Task status changed to ${status}`,
                        idempotency_key: crypto.randomUUID(),
                      });
                      await refresh();
                      setSuccess(
                        "Task updated. Production and material records are synchronized.",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Task update failed.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <Layers3 size={26} />
            <h3>No change tasks yet</h3>
            <p>
              Approve an order change to create dated production tasks here.
            </p>
            <Button asChild variant="outline">
              <Link href="/approvals">View approvals</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
