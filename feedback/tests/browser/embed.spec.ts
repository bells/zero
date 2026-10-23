import { test, expect } from "@playwright/test";
const parentOrigin = "http://127.0.0.1:4321";
for (const locale of ["zh", "en"] as const) {
  test(`${locale} Markdown feedback loads its shared thread only after a click with no document context`, async ({ page }) => {
    const requests: { url: string; body: string; referrer: string }[] = [];
    await page.route("http://127.0.0.1:4323/**", async (route) => {
      const request = route.request();
      requests.push({ url: request.url(), body: request.postData() || "", referrer: request.headers().referer || "" });
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic feedback</title>" });
    });
    await page.goto(`${parentOrigin}/feedback-review/${locale === "en" ? "en/" : ""}tools/markdown/`);
    const marker = "SYNTHETIC_MARKDOWN_PRIVATE_9520";
    await page.locator("textarea").first().fill(`# ${marker}\n\nPrivate source`);
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(requests).toEqual([]);
    await page.getByRole("button", { name: locale === "en" ? "Open feedback" : "展开反馈", exact: true }).click();
    await expect(page.locator("iframe")).toHaveAttribute("src", `http://127.0.0.1:4323/?threadId=tools%2Fmarkdown&locale=${locale}`);
    await expect.poll(() => requests.length).toBe(1);
    expect([...new URL(requests[0]!.url).searchParams.keys()].sort()).toEqual(["locale", "threadId"]);
    expect(requests[0]!.body).toBe("");
    expect(requests[0]!.referrer).toBe("");
    expect(JSON.stringify(requests)).not.toContain(marker);
    await page.getByRole("button", { name: locale === "en" ? "Close feedback" : "关闭反馈", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("textarea").first()).toHaveValue(new RegExp(marker));
  });
}
test("real separate-origin iframe loads only on click, excludes tool markers and survives close and blocked storage", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  const external: { url: string; body: string; referrer: string }[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http://127.0.0.1:4323"))
      external.push({
        url: r.url(),
        body: r.postData() || "",
        referrer: r.headers().referer || "",
      });
  });
  await page.goto(`${parentOrigin}/feedback-review/en/tools/json/`);
  const marker = "SYNTHETIC_TOOL_PRIVATE_9520";
  await page.locator("[data-source]").fill(JSON.stringify({ private: marker }));
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await expect(page.locator("[data-output]")).toHaveValue(new RegExp(marker));
  expect(external).toEqual([]);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.locator("[data-open-search]").click();
  await page
    .locator("[data-search-input]")
    .fill("SYNTHETIC_SEARCH_PRIVATE_9510");
  await page.locator("[data-close-search]").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    (document.querySelector("[data-search-input]") as HTMLInputElement).value =
      "SYNTHETIC_SEARCH_PRIVATE_9510";
  });
  await page
    .getByRole("button", { name: "Open feedback", exact: true })
    .click();
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("heading", {
      name: "Feedback and suggestions",
      exact: true,
    }),
  ).toBeVisible();
  await frame
    .getByLabel("Feedback text")
    .fill("Only this explicit synthetic feedback");
  await frame
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await expect(frame.getByRole("status")).toContainText("Received for review");
  const iframe = page
    .frames()
    .find((f) => f.url().startsWith("http://127.0.0.1:4323/"))!;
  expect(
    await iframe.evaluate(() => {
      try {
        void parent.document.body;
        return "accessible";
      } catch (error) {
        return (error as DOMException).name;
      }
    }),
  ).toBe("SecurityError");
  expect(
    await iframe.evaluate(() => {
      try {
        top!.location.href = "http://127.0.0.1:4321/forbidden-navigation";
        return "allowed";
      } catch (error) {
        return (error as DOMException).name;
      }
    }),
  ).toBe("SecurityError");
  const height = await page
    .locator("iframe")
    .evaluate((node) => node.style.height);
  await page.evaluate(() => {
    const target = document.querySelector("iframe")!.contentWindow!;
    for (const [origin, source, data] of [
      [
        "https://forged.example.invalid",
        target,
        { version: 1, type: "resize", height: 1500 },
      ],
      [
        "http://127.0.0.1:4323",
        window,
        { version: 1, type: "error", code: "unavailable" },
      ],
      [
        "http://127.0.0.1:4323",
        target,
        { version: 1, type: "resize", height: 99999 },
      ],
      [
        "http://127.0.0.1:4323",
        target,
        { version: 1, type: "resize", height: 1500, content: "private" },
      ],
    ] as const)
      window.dispatchEvent(
        new MessageEvent("message", { origin, source, data }),
      );
  });
  await expect(page.locator("iframe")).toHaveCSS("height", height);
  expect(JSON.stringify(external)).not.toContain(marker);
  expect(JSON.stringify(external)).not.toContain(
    "SYNTHETIC_SEARCH_PRIVATE_9510",
  );
  expect(external.every((r) => r.referrer === "")).toBe(true);
  await page
    .getByRole("button", { name: "Close feedback", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open feedback", exact: true }),
  ).toBeFocused();
  await expect(page.locator("[data-source]")).toHaveValue(new RegExp(marker));
});
test("frame failure, retry and keyboard close preserve the tool", async ({
  page,
}) => {
  await page.goto(`${parentOrigin}/feedback-review/tools/json/`);
  await page.locator("[data-source]").fill('{"keep":"synthetic-draft"}');
  await page.route("http://127.0.0.1:4323/**", (route) => route.abort());
  await page.getByRole("button", { name: "展开反馈", exact: true }).click();
  await expect(page.locator("[data-feedback-status]")).toContainText(
    "反馈暂时无法加载",
    { timeout: 16000 },
  );
  await expect(page.locator("[data-source]")).toHaveValue(
    '{"keep":"synthetic-draft"}',
  );
  await page.unroute("http://127.0.0.1:4323/**");
  await page.getByRole("button", { name: "重试加载", exact: true }).click();
  await expect(
    page.frameLocator("iframe").getByLabel("反馈内容"),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭反馈", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "展开反馈", exact: true }),
  ).toBeFocused();
});

test("UTF-8 file names and content stay out of feedback connections and frame messages", async ({
  page,
}) => {
  const marker = "SYNTHETIC_FILE_PRIVATE_9520";
  const requests: string[] = [];
  const messages: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:4323"))
      requests.push(request.url() + (request.postData() || ""));
  });
  await page.goto(`${parentOrigin}/feedback-review/tools/diff/`);
  await page
    .locator('[data-diff-file="before"]')
    .setInputFiles({
      name: `${marker}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`${marker}\nBefore`),
    });
  await expect(page.locator('[data-diff-source="before"]')).toHaveValue(
    new RegExp(marker),
  );
  await page.locator('[data-diff-source="after"]').fill("After");
  await page.locator("[data-diff-compare]").click();
  await expect(page.locator("[data-diff-result]")).toBeVisible();
  expect(requests).toEqual([]);
  await page.exposeFunction("observeFeedbackMessage", (data: unknown) => {
    messages.push(data);
  });
  await page.evaluate(() => {
    window.addEventListener("message", (event) => {
      if (event.origin === "http://127.0.0.1:4323")
        void (
          window as unknown as {
            observeFeedbackMessage: (data: unknown) => Promise<void>;
          }
        ).observeFeedbackMessage(event.data);
    });
  });
  await page.getByRole("button", { name: "展开反馈", exact: true }).click();
  await expect(
    page.frameLocator("iframe").getByLabel("反馈内容"),
  ).toBeVisible();
  expect(JSON.stringify(requests)).not.toContain(marker);
  expect(JSON.stringify(messages)).not.toContain(marker);
  for (const message of messages) {
    expect(
      Object.keys(message as object).every((key) =>
        ["version", "type", "height", "code"].includes(key),
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "output/browser/embed-diff-feedback-zh.png",
    fullPage: true,
  });
});
