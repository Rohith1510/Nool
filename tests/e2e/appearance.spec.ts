import { test, expect } from "@playwright/test";

test("the public sample recalculates without writing operational records", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      writes.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A buyer change.",
  );
  await expect(
    page.getByText("A split shipment is feasible", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try 100 more pieces of capacity" })
    .click();
  await expect(
    page.getByText("Same-date plan available", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".preview-shipments > div")).toHaveCount(1);
  await expect(page.locator(".preview-quantity")).toContainText("600");
  await page.getByRole("button", { name: "Restore sample capacity" }).click();
  await expect(page.locator(".preview-shipments > div")).toHaveCount(2);
  expect(writes).toEqual([]);
});

test("appearance follows the system and a manual choice survives navigation and reload", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|did not match/i.test(message.text())
    )
      hydrationErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light dark");
  await expect(
    page.getByRole("button", { name: "Toggle dark mode" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.goto("/sign-in");
  await expect(
    page.getByRole("button", { name: "Toggle dark mode" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  expect(hydrationErrors).toEqual([]);
});

test("landing fits small screens and theme control is keyboard accessible", async ({
  page,
}) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Toggle dark mode" });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await toggle.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-mode", /light|dark/);
  const sizes = [375, 768, 1280, 1920];
  for (const width of sizes) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("the landing content is server rendered without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText("A split shipment is feasible", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open workspace" }).first(),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Hairline planning figure supports direct exploration with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const stage = page.locator(".planning-stage");
  await expect(stage.locator("svg > g")).toBeVisible();
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error("Planning scene has no bounds");
  await page.mouse.move(
    bounds.x + (bounds.width * 277) / 400,
    bounds.y + (bounds.height * 137) / 320,
  );
  await expect(page.locator(".planning-scene figcaption > span")).toHaveText(
    "Protect the first shipment.",
  );
  await page.mouse.move(1, 1);
  await expect(page.locator(".planning-scene figcaption > span")).toHaveText(
    "From production to shipment.",
  );
  await expect(stage).toHaveAttribute("data-playing", "false");
  await expect(
    page.getByRole("button", { name: "Pause animation" }),
  ).toHaveCount(0);
});

test("example conversation changes topic without starting a real voice session", async ({
  page,
}) => {
  let sessions = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/voice/session")) sessions++;
  });
  await page.goto("/");
  await expect(
    page.getByText("Illustrative transcript", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Another line", exact: true }).click();
  await expect(page.locator(".voice-preview-response")).toContainText(
    "Studio Common",
  );
  await page
    .getByRole("button", { name: "Before committing", exact: true })
    .click();
  await expect(page.locator(".voice-preview-response")).toContainText(
    "separate confirmation",
  );
  expect(sessions).toBe(0);
});

test("planning scene autoplays and its discreet control pauses and resumes it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const stage = page.locator(".planning-stage");
  await expect(stage).toHaveAttribute("data-playing", "true");
  await expect(
    page.getByRole("button", { name: "Explore scene", exact: true }),
  ).toHaveCount(0);
  const pause = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  await pause.focus();
  await pause.press("Enter");
  await expect(stage).toHaveAttribute("data-playing", "false");
  const resume = page.getByRole("button", {
    name: "Resume animation",
    exact: true,
  });
  await resume.press("Enter");
  await page
    .locator(".planning-play")
    .evaluate((element) => (element as HTMLElement).blur());
  await expect(stage).toHaveAttribute("data-playing", "true");
});
