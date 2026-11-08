import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
const slugs = [
  "qrcode",
  "text-cleanup",
  "hash",
  "regex",
  "sql",
  "date-calculator",
  "password",
  "cron",
] as const;
const ready = async (page: Page, slug: string, prefix = "/en") => {
  await page.goto(`${prefix}/tools/${slug}/`);
  await expect(page.locator("[data-web-tools]")).toHaveAttribute(
    "data-ready",
    "true",
  );
};
for (const prefix of ["", "/en"])
  for (const slug of slugs) {
    test(`${prefix || "zh"} everyday ${slug} executes explicitly and invalidates exports`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await ready(page, slug, prefix);
      await expect(page.locator("[data-output]")).toHaveValue("");
      await page.locator("[data-everyday-example]").click();
      await expect(page.locator("[data-everyday-download]")).toBeDisabled();
      await page.locator('[data-everyday-run="format"]').click();
      await expect(page.locator("[data-everyday-download]")).toBeEnabled();
      const output = await page.locator("[data-output]").inputValue();
      expect(output.length).toBeGreaterThan(0);
      if (slug === "hash")
        expect(output).toContain(
          createHash("sha256").update("abc").digest("hex"),
        );
      if (slug === "regex") expect(output).toBe("b-a b-a");
      if (slug === "text-cleanup") expect(output).toBe("a\nb\n");
      if (slug === "date-calculator") expect(output).toBe("3");
      if (slug === "cron") expect(output).toContain("2026-11-08T09:00:00.000Z");
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-everyday-download]").click();
      const download = await downloadPromise;
      expect((await readFile((await download.path())!)).toString()).toBe(
        output,
      );
      const source = page.locator("[data-source]");
      if (await source.count()) await source.fill("edited");
      else if (slug === "password")
        await page.locator('[data-option="length"]').fill("21");
      else if (slug === "cron")
        await page.locator('[data-option="expression"]').fill("0 10 * * *");
      else await page.locator('[data-option="start"]').fill("2026-11-07");
      await expect(page.locator("[data-everyday-download]")).toBeDisabled();
      await expect(page.locator("[data-output]")).toHaveValue("");
      expect(errors).toEqual([]);
    });
  }
test("QR actual PNG and SVG exports decode Unicode exactly, decoded URLs stay passive", async ({
  page,
}) => {
  await ready(page, "qrcode");
  const text = " https://private.example.invalid/你好😀\n";
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.locator("[data-source]").fill(text);
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-qr-png]")).toBeEnabled();
  const pngPromise = page.waitForEvent("download");
  await page.locator("[data-qr-png]").click();
  const png = await readFile((await (await pngPromise).path())!);
  const meta = await sharp(png).metadata();
  expect([meta.width, meta.height]).toEqual([1024, 1024]);
  const svgPromise = page.waitForEvent("download");
  await page.locator("[data-qr-svg]").click();
  const svg = await readFile((await (await svgPromise).path())!);
  expect(svg.toString()).toContain("<svg");
  for (const buffer of [png, await sharp(svg).png().toBuffer()]) {
    await page.locator('[data-option="qr-mode"]').selectOption("decode");
    await page
      .locator('[data-option="file"]')
      .setInputFiles({
        name: "misleading.jpg",
        mimeType: "image/jpeg",
        buffer,
      });
    await page.locator("[data-everyday-run]").click();
    await expect(page.locator("[data-everyday-download]")).toBeEnabled();
    await expect(page.locator("[data-output]")).toHaveValue(text);
  }
  expect(
    requests.filter((url) => url.includes("private.example.invalid")),
  ).toEqual([]);
  expect(
    requests.filter(
      (url) => url.includes("你好") || url.includes("private.example"),
    ),
  ).toEqual([]);
  const empty = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await page
    .locator('[data-option="file"]')
    .setInputFiles({ name: "empty.png", mimeType: "image/png", buffer: empty });
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-status]")).toContainText("No decodable");
  await expect(page.locator("[data-everyday-download]")).toBeDisabled();
});
test("text cleanup successful empty result downloads zero bytes and copy failure uses full fallback", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("synthetic denied");
        },
      },
      configurable: true,
    }),
  );
  await ready(page, "text-cleanup");
  await page.locator("[data-source]").fill(" \t\n");
  await page.locator('[data-option="removeEmpty"]').check();
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-everyday-download]")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-everyday-download]").click();
  expect((await readFile((await (await downloadPromise).path())!)).length).toBe(
    0,
  );
  await page.locator("[data-source]").fill("private\nprivate\n");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-everyday-copy]")).toBeEnabled();
  await page.locator("[data-everyday-copy]").click();
  await expect(page.locator("[data-manual-value]")).toHaveValue("private\n");
  await page.locator("[data-clear]").click();
  await expect(page.locator("[data-manual-value]")).toHaveValue("");
});
test("regex terminates pathological backtracking, supports cancel and restarts", async ({
  page,
}) => {
  await ready(page, "regex");
  await page.locator('[data-option="pattern"]').fill("(a+)+$");
  await page.locator("[data-source]").fill("a".repeat(30000) + "!");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-cancel]")).toBeVisible();
  await expect(page.locator("[data-status]")).toContainText("deadline", {
    timeout: 10000,
  });
  await expect(page.locator("[data-everyday-download]")).toBeDisabled();
  await page.locator("[data-everyday-run]").click();
  await page.locator("[data-cancel]").click();
  await expect(page.locator("[data-status]")).toContainText("cancelled");
  await page.locator("[data-everyday-example]").click();
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-output]")).toHaveValue("b-a b-a");
  await expect(page.locator("[data-regex-captures]")).toContainText("captures");
});
test("file hash reads exact bytes, checks expected digest and rejects oversized files", async ({
  page,
}) => {
  await ready(page, "hash");
  const bytes = Buffer.from("zero\0\xff\r\n", "latin1");
  const digest = createHash("sha256").update(bytes).digest("hex");
  await page.locator('[data-option="hash-mode"]').selectOption("file");
  await page.locator('[data-option="expected"]').fill(digest.toUpperCase());
  await page
    .locator('[data-option="file"]')
    .setInputFiles({
      name: "local.bin",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-output]")).toContainText("");
  await expect(page.locator("[data-output]")).toHaveValue("SHA256\n" + digest);
  await expect(page.locator("[data-status]")).toContainText("matches");
  await page.locator('[data-option="algorithm"]').selectOption("sha512");
  await expect(page.locator("[data-everyday-download]")).toBeDisabled();
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-status]")).toContainText(
    "exact hexadecimal length",
  );
  await page
    .locator('[data-option="file"]')
    .evaluate((input: HTMLInputElement) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(
          [new Blob([new Uint8Array(256 * 1024 * 1024 + 1)])],
          "synthetic-large.bin",
        ),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-status]")).toContainText("limits");
});
test("password per-item copy fallback and history disposal keep generated values temporary", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw Error("synthetic");
        },
      },
      configurable: true,
    }),
  );
  await ready(page, "password");
  await page.locator('[data-option="count"]').fill("3");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-password-list] button")).toHaveCount(3);
  const first = await page
    .locator("[data-password-list] code")
    .first()
    .innerText();
  await page.locator("[data-password-list] button").first().click();
  await expect(page.locator("[data-manual-value]")).toHaveValue(first);
  await page.goto("/en/tools/");
  await page.goBack();
  await expect(page.locator("[data-web-tools]")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator("[data-output]")).toHaveValue("");
  await expect(page.locator("[data-password-list] button")).toHaveCount(0);
});
test("preview base supports every new Worker and fourth-category navigation", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:4321/zero-preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      "/zero-preview/".length,
    );
    await route.fulfill({
      path: `output/fixtures/preview/${path}${path.endsWith("/") ? "index.html" : ""}`,
    });
  });
  await page.goto(
    "/zero-preview/en/tools/?category=date-calculation&source=PRIVATE",
  );
  await expect(page.locator(".wt-directory-row:visible")).toHaveCount(1);
  await expect(page.locator(".wt-directory-row:visible")).toHaveAttribute(
    "href",
    "/zero-preview/en/tools/date-calculator/",
  );
  for (const slug of slugs) {
    await ready(page, slug, "/zero-preview/en");
    await page.locator("[data-everyday-example]").click();
    await page.locator('[data-everyday-run="format"]').click();
    await expect(page.locator("[data-everyday-download]")).toBeEnabled();
    if (slug === "qrcode") {
      const downloading = page.waitForEvent("download");
      await page.locator("[data-qr-png]").click();
      const bytes = await readFile((await (await downloading).path())!);
      await page.locator('[data-option="qr-mode"]').selectOption("decode");
      await page
        .locator('[data-option="file"]')
        .setInputFiles({
          name: "qr.png",
          mimeType: "image/png",
          buffer: bytes,
        });
      await page.locator("[data-everyday-run]").click();
      await expect(page.locator("[data-output]")).toHaveValue(
        "你好，Zero 😀\n",
      );
    }
  }
});
test("changes during delayed dependency loading cancel and cannot revive obsolete QR results", async ({
  page,
}) => {
  await ready(page, "qrcode");
  let resume = () => {};
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route("**/qrcode-process*.js", async (route) => {
    await released;
    await route.continue().catch(() => {});
  });
  await page.locator("[data-source]").fill("old payload");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-cancel]")).toBeVisible();
  await page.locator("[data-source]").fill("new payload");
  resume();
  await page.waitForTimeout(300);
  await expect(page.locator("[data-output]")).toHaveValue("");
  await expect(page.locator("[data-everyday-download]")).toBeDisabled();
  await page.unroute("**/qrcode-process*.js");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-output]")).toHaveValue("new payload");
});
test("QR malformed, animation and dimension or byte limits fail without stale exports", async ({
  page,
}) => {
  await ready(page, "qrcode");
  await page.locator('[data-option="qr-mode"]').selectOption("decode");
  const oversize = await sharp({
    create: { width: 8193, height: 1, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const animated = Buffer.alloc(30);
  animated.write("RIFF");
  animated.writeUInt32LE(22, 4);
  animated.write("WEBPVP8X", 8);
  animated.writeUInt32LE(10, 16);
  animated[20] = 2;
  const invalidImages: [string, Buffer][] = [
    ["bad.png", Buffer.from("not an image")],
    ["animated.webp", animated],
    ["wide.png", oversize],
    ["large.png", Buffer.alloc(16 * 1024 * 1024 + 1)],
  ];
  for (const [name, buffer] of invalidImages) {
    await page
      .locator('[data-option="file"]')
      .setInputFiles({ name, mimeType: "image/png", buffer });
    await page.locator("[data-everyday-run]").click();
    await expect(page.locator("[data-status]")).toHaveAttribute(
      "data-error",
      "true",
    );
    await expect(page.locator("[data-everyday-download]")).toBeDisabled();
  }
});
test("all new controls remain usable at 200 percent zoom with keyboard execution", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 1000 });
  for (const slug of slugs) {
    await ready(page, slug);
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.locator("[data-everyday-example]").focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-everyday-run="format"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-everyday-download]")).toBeEnabled();
  }
});
test("hash initialization failure reports a typed error without retaining a digest", async ({
  page,
}) => {
  await page.route("**/hash-*.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        'WebAssembly.compile=async()=>{throw new Error("synthetic engine failure")};\n' +
        (await response.text()),
    });
  });
  await ready(page, "hash");
  await page.locator("[data-source]").fill("abc");
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-status]")).toContainText(
    "Hash processing failed",
  );
  await expect(page.locator("[data-everyday-download]")).toBeDisabled();
});
test("file hashing enforces configured end-to-end deadline during dependency loading", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) =>
      schedule(
        handler,
        delay === 60000 ? 50 : delay,
        ...args,
      )) as typeof window.setTimeout;
  });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/hash-*.js", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  try {
    await ready(page, "hash");
    await page.locator('[data-option="hash-mode"]').selectOption("file");
    await page
      .locator('[data-option="file"]')
      .setInputFiles({
        name: "slow.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("abc"),
      });
    await page.locator("[data-everyday-run]").click();
    await expect(page.locator("[data-status]")).toContainText("deadline");
    release();
    await page.waitForTimeout(100);
    await expect(page.locator("[data-everyday-download]")).toBeDisabled();
  } finally {
    release();
  }
});
test("repeated downloads reuse current URLs and clear revokes previews and exports", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL),
      active = new Set<string>();
    Object.defineProperty(window, "syntheticActiveUrls", { value: active });
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      active.delete(url);
      revoke(url);
    };
  });
  await ready(page, "qrcode");
  await page.locator("[data-everyday-example]").click();
  await page.locator("[data-everyday-run]").click();
  await expect(page.locator("[data-qr-png]")).toBeEnabled();
  for (let index = 0; index < 3; index++) {
    const downloading = page.waitForEvent("download");
    await page.locator("[data-qr-png]").click();
    await downloading;
  }
  expect(
    await page.evaluate(() => Reflect.get(window, "syntheticActiveUrls").size),
  ).toBe(2);
  await page.locator("[data-clear]").click();
  expect(
    await page.evaluate(() => Reflect.get(window, "syntheticActiveUrls").size),
  ).toBe(0);
});

test('Cron default baseline freezes at execution time and explicit baselines reproduce', async ({page})=>{
  await page.clock.install({time:new Date('2026-11-08T00:00:00Z')});
  await ready(page,'cron');
  await expect(page.locator('[data-option="baseline"]')).toHaveValue('');
  await page.locator('[data-option="timezone"]').fill('UTC');
  await page.clock.fastForward(3600000);
  await page.locator('[data-everyday-run]').click();
  await expect(page.locator('[data-output]')).toHaveValue(/Baseline 2026-11-08T01:00:/);
  await page.locator('[data-option="baseline"]').fill('2026-11-08T00:00:00Z');
  await page.locator('[data-everyday-run]').click();
  await expect(page.locator('[data-output]')).toHaveValue(/Baseline 2026-11-08T00:00:00.000Z/);
});

test('password example fills the documented default settings without generating', async ({page})=>{
  await ready(page,'password');
  await page.locator('[data-option="length"]').fill('32');
  await page.locator('[data-option="count"]').fill('3');
  await page.locator('[data-option="symbols"]').check();
  await page.locator('[data-everyday-example]').click();
  await expect(page.locator('[data-option="length"]')).toHaveValue('20');
  await expect(page.locator('[data-option="count"]')).toHaveValue('1');
  await expect(page.locator('[data-option="symbols"]')).not.toBeChecked();
  await expect(page.locator('[data-output]')).toHaveValue('');
  await expect(page.locator('[data-everyday-download]')).toBeDisabled();
});
