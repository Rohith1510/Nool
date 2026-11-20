"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  ClipboardCheck,
  Shirt,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
export function OrdersScreen() {
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const { workspace: w } = useWorkspace();
  const params = useSearchParams(),
    router = useRouter();
  const query = params.get("q") ?? "",
    status = params.get("status") ?? "all",
    date = params.get("date") ?? "";
  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`/orders?${p}`, { scroll: false });
  };
  const pending = w.change_proposals.filter((p) => p.status === "pending");
  const orders = w.orders.filter((o) => {
    const buyer = w.buyers.find((b) => b.id === o.buyer_id);
    return (
      `${o.reference} ${buyer?.name} ${o.style}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || o.status === status) &&
      (!date || o.committed_ship_date <= date)
    );
  });
  return (
    <div className="orders-page">
      <div className="page-heading">
        <div>
          <h1>Orders</h1>
          <p>A shared view of what you’ve committed to.</p>
        </div>
        <div className="count-label">
          <span className="mono">
            {w.orders.length.toString().padStart(2, "0")}
          </span>
          active records
        </div>
      </div>
      {pending.length > 0 && (
        <Link href="/approvals?status=pending" className="pending-banner">
          <ClipboardCheck size={18} />
          <span>
            <strong>
              {pending.length} change{" "}
              {pending.length === 1 ? "proposal" : "proposals"} awaiting review
            </strong>
            <span>
              {" "}
              Production approval is needed before commitments change.
            </span>
          </span>
          <ChevronRight size={18} />
        </Link>
      )}
      <section className="panel orders-panel">
        <div className="filter-row">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search order or buyer"
              ref={searchInput}
              placeholder="Search order reference, buyer, or style…"
              value={query}
              onChange={(e) => update("q", e.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <label className="inline-label">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Order status"
              value={status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_production">In production</option>
              <option value="ready">Ready</option>
              <option value="shipped">Shipped</option>
            </select>
          </label>
          <label className="inline-label">
            <CalendarDays size={15} />
            <span className="sr-only">Ship by</span>
            <input
              aria-label="Ship by date"
              type="date"
              value={date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>
        </div>
        {orders.length ? (
          <div className="table-scroll">
            <table
              className="orders-table"
              role="table"
              aria-label="Order book"
            >
              <thead>
                <tr>
                  <th>Order / buyer</th>
                  <th>Garment</th>
                  <th>Quantity</th>
                  <th>Production</th>
                  <th>Committed shipment</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="order-ref" href={`/orders/${o.id}`}>
                        #{o.reference}
                      </Link>
                      <span className="cell-secondary">
                        {w.buyers.find((b) => b.id === o.buyer_id)?.name}
                      </span>
                    </td>
                    <td>
                      <strong>{o.style.split(" / ")[0]}</strong>
                      <span className="cell-secondary">{o.color}</span>
                    </td>
                    <td className="mono">
                      {o.quantity.toLocaleString()}
                      <span className="cell-secondary">pieces</span>
                    </td>
                    <td>
                      <div className="production-cell">
                        <span className="mono">
                          {o.completed_quantity} / {o.quantity}
                        </span>
                        <progress
                          value={o.completed_quantity}
                          max={o.quantity}
                          aria-label={`Production for order ${o.reference}`}
                        />
                      </div>
                    </td>
                    <td className="mono">
                      {formatDate(o.committed_ship_date)}
                      <span className="cell-secondary">
                        {o.committed_ship_date.slice(0, 4)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${o.status === "ready" ? "badge-green" : "badge-neutral"}`}
                      >
                        {o.status.replaceAll("_", " ")}
                      </span>
                      {w.change_proposals.some(
                        (p) => p.order_id === o.id && p.status === "pending",
                      ) && (
                        <span className="cell-secondary amber-text">
                          Change pending
                        </span>
                      )}
                    </td>
                    <td>
                      <Link
                        className="icon-link"
                        href={`/orders/${o.id}`}
                        aria-label={`Open order ${o.reference}`}
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Shirt size={32} />
            <h2>
              {w.orders.length
                ? "No matching orders"
                : "Your order book starts here"}
            </h2>
            <p>
              {w.orders.length
                ? "Try another reference, buyer, or filter."
                : "Run the explicit sample seed command to add a coherent planning scenario."}
            </p>
            <Button variant="outline" onClick={() => router.replace("/orders")}>
              Clear filters
            </Button>
          </div>
        )}
        <div className="table-footer">
          <span>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
          <span>Shipment dates are approved commitments.</span>
        </div>
      </section>
      <div className="workspace-note">
        <Shirt size={20} />
        <div>
          <h2>Start with an order. Follow the change through.</h2>
          <p>
            Open an order to check its material and capacity, compare shipment
            plans, and submit a change for approval.
          </p>
        </div>
      </div>
    </div>
  );
}
