import { test, expect } from "@playwright/test";
import { sampleIds } from "../../lib/sample";
test("setup is reachable and the sign-in path has clear configuration state", async ({
  page,
}) => {
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Integration readiness" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Get the workspace running" }),
  ).toBeVisible();
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
test("unauthenticated writes are rejected", async ({ request }) => {
  const response = await request.post("/api/evaluate", {
    data: { order_id: sampleIds.orderA, quantity: 600 },
  });
  expect(response.ok()).toBe(false);
});
test("merchandiser to production lead approval through normal application entry points", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(
    process.env.E2E_RUN_WORKFLOW !== "1" || testInfo.project.name !== "desktop",
    "Requires an explicitly enabled, freshly seeded Supabase sample company and both account credentials.",
  );
  const merchContext = await browser.newContext({ baseURL }),
    leadContext = await browser.newContext({ baseURL });
  try {
    const merch = await merchContext.newPage(),
      lead = await leadContext.newPage();
    for (const [page, email, password] of [
      [merch, process.env.E2E_MERCH_EMAIL, process.env.E2E_MERCH_PASSWORD],
      [lead, process.env.E2E_LEAD_EMAIL, process.env.E2E_LEAD_PASSWORD],
    ] as const) {
      if (!email || !password)
        throw new Error("Set the four E2E account credentials first.");
      await page.goto("/sign-in");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/orders/);
    }
    await merch.goto(`/orders/${sampleIds.orderA}`);
    await merch.getByLabel("Requested quantity").fill("600");
    await merch.getByRole("button", { name: "Evaluate change" }).click();
    await expect(
      merch.getByRole("heading", { name: "Split the shipment" }),
    ).toBeVisible();
    await expect(
      merch.getByText("Studio Common", { exact: false }).first(),
    ).toBeVisible();
    await merch
      .getByRole("button", { name: "Select this plan" })
      .first()
      .click();
    await merch
      .getByLabel(
        "I’ve checked the size split, shipment plan, costs, and assumptions.",
      )
      .check();
    await merch
      .getByRole("button", { name: "Submit for production approval" })
      .click();
    await expect(
      merch.getByRole("heading", { name: /Proposal #\d+ submitted/ }),
    ).toBeVisible();
    await lead.goto("/approvals");
    await lead
      .getByRole("button", { name: "Approve plan", exact: true })
      .click();
    await lead
      .getByRole("button", { name: "Confirm approval", exact: true })
      .click();
    await expect(
      lead.getByRole("heading", { name: "Buyer communication" }),
    ).toBeVisible();
    const updated = await merch.request.get("/api/workspace");
    expect(updated.ok()).toBe(true);
    const w = await updated.json();
    const order = w.orders.find(
      (o: { id: string }) => o.id === sampleIds.orderA,
    );
    expect(order.quantity).toBe(600);
    expect(order.shipment_plan).toHaveLength(2);
    expect(w.production_tasks.length).toBe(4);
    expect(
      w.audit_events.some(
        (e: { event_type: string }) => e.event_type === "proposal_approved",
      ),
    ).toBe(true);
    expect(
      Number(
        w.material_reservations.find(
          (r: { order_id: string }) => r.order_id === sampleIds.orderA,
        ).reserved_kg,
      ),
    ).toBe(105);
    await lead.goto("/production");
    const slot = w.capacity_slots.find(
      (s: { line_id: string; work_date: string }) =>
        s.line_id === sampleIds.lineB &&
        s.work_date === w.organization.reference_date,
    );
    await lead
      .getByRole("button", {
        name: `Edit Line B ${slot.work_date}`,
        exact: true,
      })
      .click();
    await lead.getByLabel("Standard garments").fill("200");
    await lead
      .getByLabel("Reason", { exact: true })
      .fill("Additional trained operators available");
    await lead.getByRole("button", { name: "Save capacity" }).click();
    await expect(lead.getByRole("status")).toContainText("Capacity saved");
    await merch.goto(`/orders/${sampleIds.orderA}`);
    await merch.getByLabel("Requested quantity").fill("600");
    await merch
      .getByLabel("Requested shipment")
      .fill(w.change_proposals[0].requested_ship_date);
    await merch.getByRole("button", { name: "Evaluate change" }).click();
    await expect(
      merch.getByRole("heading", {
        name: "Keep the shipment date",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await merchContext.close();
    await leadContext.close();
  }
});
