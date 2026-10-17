import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("anonymous form preserves literal text, confirms review and does not publish or persist profile", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4323")
      external.push(request.url());
  });
  await page.goto("/?threadId=tools/json&locale=zh");
  await expect(
    page.getByRole("heading", { name: "反馈与建议", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("反馈内容")
    .fill(
      '<img src="https://private.example.invalid/image">\n![x](https://private.example.invalid/file) 😀',
    );
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已收到，等待审核");
  await expect(page.locator("[data-feedback-list]")).not.toContainText(
    "private.example.invalid",
  );
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookies: document.cookie,
    })),
  ).toEqual({ local: {}, session: {}, cookies: "" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("owner reviews and replies, literal content remains inert, then hides parent and replies", async ({
  page,
  request,
}) => {
  await request.post("/api/feedback", {
    headers: { Origin: "http://127.0.0.1:4323" },
    data: {
      threadId: "tools/diff",
      content: "<b>synthetic-review</b>",
      nickname: "Maintainer",
      email: "private@example.invalid",
      idempotencyKey: "browser-owner-attempt-001",
    },
  });
  await page.goto("/admin");
  await page.getByLabel("Email").fill("owner@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const row = page
    .locator("article")
    .filter({ hasText: "<b>synthetic-review</b>" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await row.getByLabel("Owner reply").fill("Synthetic owner reply");
  await row.getByRole("button", { name: "Publish reply" }).click();
  await page.goto("/?threadId=tools/diff&locale=en");
  await expect(page.locator("[data-feedback-list]")).toContainText(
    "<b>synthetic-review</b>",
  );
  await expect(page.locator("[data-feedback-list] b")).toHaveCount(0);
  await expect(page.locator("[data-feedback-list]")).not.toContainText(
    "private@example.invalid",
  );
  await expect(page.locator('[data-author-role="visitor"]')).toBeVisible();
  await page.getByRole("button", { name: "Maintainer responses" }).click();
  await expect(page.locator("[data-feedback-list]")).toContainText(
    "Synthetic owner reply",
  );
});

test("320px, dark theme, zoom, keyboard and failure retry keep the in-memory draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?threadId=tools&locale=en");
  await page.getByLabel("Feedback text").fill("Keep my synthetic draft");
  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "rate_limited", retryAfterSeconds: 60 }),
    }),
  );
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Too many submissions");
  await expect(page.getByLabel("Feedback text")).toHaveValue(
    "Keep my synthetic draft",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .focus();
  await expect(
    page.getByRole("button", { name: "Submit feedback", exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("new text edited during an uncertain request is preserved after acknowledgement", async ({
  page,
}) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/feedback", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.goto("/?threadId=tools&locale=en");
  await page.getByLabel("Feedback text").fill("Original synthetic submission");
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit feedback", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Feedback text").fill("A new unsent synthetic draft");
  release();
  await expect(page.getByRole("status")).toContainText(
    "edited draft has not been submitted",
  );
  await expect(page.getByLabel("Feedback text")).toHaveValue(
    "A new unsent synthetic draft",
  );
});

test("native provider HTTP paths remain closed at the actual transport boundary", async ({
  request,
}) => {
  for (const prefix of [
    "",
    "/api",
    "/.netlify/functions/waline",
    "/.netlify/functions/waline/api",
  ])
    for (const path of [
      "/comment",
      "/comment/id",
      "/comment/rss",
      "/user",
      "/user/id",
      "/db",
      "/token",
      "/article",
      "/oauth",
      "/verification",
      "/user/password",
      "/token/2fa",
      "/ui",
    ])
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const response = await request.fetch(`${prefix}${path}?method=post`, {
          method,
          headers: { Origin: "http://127.0.0.1:4323" },
          ...(method === "GET"
            ? {}
            : { data: { status: "approved", type: "administrator" } }),
        });
        expect(response.status(), `${method} ${prefix}${path}`).toBe(404);
      }
});

test("a persisted submission with a lost response times out and only retries on an explicit action", async ({
  page,
}) => {
  const attempts: unknown[] = [];
  const receipts: unknown[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/feedback", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postDataJSON() as unknown);
    const response = await route.fetch();
    receipts.push((await response.json()) as unknown);
    if (attempts.length === 1) await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto("/?threadId=tools/base64&locale=en");
  await page
    .getByLabel("Feedback text")
    .fill("Synthetic lost-response submission");
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Request timed out", {
    timeout: 12000,
  });
  expect(attempts).toHaveLength(1);
  await expect(page.getByLabel("Feedback text")).toHaveValue(
    "Synthetic lost-response submission",
  );
  release();
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Received for review");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(receipts[1]).toEqual(receipts[0]);
});
