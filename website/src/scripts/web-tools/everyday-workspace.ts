import { everydayCopy } from "../../content/everyday-copy";
import { JobRunner } from "../../lib/web-tools/job-runner";
import { fail, type Result } from "../../lib/web-tools/contracts";
import {
  validateEverydayJob,
  type EverydayJob,
  type EverydayTool,
  type EverydayValue,
} from "../../lib/web-tools/everyday-contracts";
import { element, type UI } from "./ui";
import { refreshLineNumbers } from "./line-numbers";

export function initEveryday(ui: UI, tool: EverydayTool): void {
  const { root, locale, c } = ui,
    e = everydayCopy[locale];
  const control = (name: string) =>
    element<HTMLInputElement | HTMLSelectElement>(
      root,
      `[data-option="${name}"]`,
    );
  const value = (name: string) => control(name).value;
  const checked = (name: string) =>
    element<HTMLInputElement>(root, `[data-option="${name}"]`).checked;
  const number = (name: string) =>
    element<HTMLInputElement>(root, `[data-option="${name}"]`).valueAsNumber;
  const choice = <T extends string>(name: string, choices: readonly T[]): T =>
    choices.find((item) => item === value(name)) ?? choices[0]!;
  const source = root.querySelector<HTMLTextAreaElement>("[data-source]");
  const output = element<HTMLTextAreaElement>(root, "[data-output]");
  const copy = element<HTMLButtonElement>(root, "[data-everyday-copy]");
  const download = element<HTMLButtonElement>(root, "[data-everyday-download]");
  const cancel = element<HTMLButtonElement>(root, "[data-cancel]");
  const actions = [
    ...root.querySelectorAll<HTMLButtonElement>("[data-everyday-run]"),
  ];
  const file = root.querySelector<HTMLInputElement>('[data-option="file"]');
  const urls: string[] = [];
  const downloads = new Map<string, string>();
  let revision = 0,
    alive = true,
    result: EverydayValue | undefined,
    page = 0;
  let runner: JobRunner<EverydayJob, EverydayValue> | undefined;
  const listeners = new AbortController(),
    options = { signal: listeners.signal };
  const busy = (active: boolean) => {
    root.setAttribute("aria-busy", String(active));
    cancel.hidden = !active;
    actions.forEach((button) => {
      button.disabled = active;
    });
  };
  const invalidate = () => {
    revision++;
    runner?.cancel();
    runner = undefined;
    busy(false);
    result = undefined;
    page = 0;
    output.value = "";
    refreshLineNumbers(output);
    copy.disabled = true;
    download.disabled = true;
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    downloads.clear();
    root.querySelector("[data-password-list]")?.replaceChildren();
    const matches = root.querySelector<HTMLElement>("[data-regex-results]");
    if (matches) {
      matches.hidden = true;
      for (const selector of [
        "[data-regex-captures]",
        "[data-regex-highlight]",
        "[data-regex-summary]",
      ])
        matches.querySelector(selector)?.replaceChildren();
    }
    const preview = root.querySelector<HTMLElement>("[data-qr-preview]");
    if (preview) {
      preview.hidden = true;
      element<HTMLImageElement>(preview, "img").removeAttribute("src");
    }
    root
      .querySelectorAll<HTMLButtonElement>("[data-qr-png], [data-qr-svg]")
      .forEach((button) => {
        button.disabled = true;
      });
    element<HTMLElement>(root, "[data-manual-copy]").hidden = true;
    element<HTMLTextAreaElement>(root, "[data-manual-value]").value = "";
  };
  const updateMode = () => {
    if (tool === "hash" || tool === "qrcode") {
      const fileMode =
        tool === "hash"
          ? value("hash-mode") === "file"
          : value("qr-mode") === "decode";
      element<HTMLElement>(root, "[data-file-control]").hidden = !fileMode;
      element<HTMLElement>(root, "[data-source-control]").hidden = fileMode;
      if (tool === "qrcode")
        actions[0]!.textContent = fileMode ? e.decode : e.generate;
    }
    if (tool === "date-calculator") {
      const shift = value("date-action") === "shift";
      element<HTMLElement>(root, "[data-date-end]").hidden = shift;
      element<HTMLElement>(root, "[data-date-amount]").hidden = !shift;
    }
  };
  const changed = () => {
    invalidate();
    updateMode();
    if (source) refreshLineNumbers(source);
    ui.status(c.ready);
  };
  const readJob = (action: "format" | "compact"): Result<EverydayJob> => {
    const input = source?.value ?? "";
    switch (tool) {
      case "text-cleanup":
        return {
          ok: true,
          value: {
            tool,
            input,
            options: {
              trim: checked("trim"),
              case: choice("case", ["keep", "lower", "upper"]),
              removeEmpty: checked("removeEmpty"),
              deduplicate: checked("deduplicate"),
              sort: choice("sort", ["none", "ascending", "descending"]),
            },
          },
        };
      case "date-calculator":
        return {
          ok: true,
          value: {
            tool,
            options: {
              action: choice("date-action", ["difference", "shift"]),
              start: value("start"),
              end: value("end"),
              amount: number("amount"),
              weekends: checked("weekends"),
            },
          },
        };
      case "password":
        return {
          ok: true,
          value: {
            tool,
            options: {
              length: number("length"),
              count: number("count"),
              uppercase: checked("uppercase"),
              lowercase: checked("lowercase"),
              digits: checked("digits"),
              symbols: checked("symbols"),
            },
          },
        };
      case "regex":
        return {
          ok: true,
          value: {
            tool,
            options: {
              input,
              pattern: value("pattern"),
              flags: value("flags"),
              replacement: value("replacement"),
            },
          },
        };
      case "sql":
        return {
          ok: true,
          value: {
            tool,
            options: {
              input,
              dialect: choice("dialect", ["mysql", "postgresql", "sqlite"]),
              action,
            },
          },
        };
      case "cron":
        return {
          ok: true,
          value: {
            tool,
            options: {
              expression: value("expression"),
              mode: choice("cron-mode", ["unix", "spring"]),
              baseline: value("baseline") || new Date().toISOString(),
              timezone: value("timezone"),
              locale,
            },
          },
        };
      case "hash": {
        const algorithm = choice("algorithm", [
            "sha256",
            "sha512",
            "sha1",
            "md5",
          ]),
          expected = value("expected");
        if (value("hash-mode") === "text")
          return {
            ok: true,
            value: {
              tool,
              options: { mode: "text", input, algorithm, expected },
            },
          };
        const selected = file?.files?.[0];
        if (!selected) return fail("empty");
        return selected.size <= 256 * 1024 * 1024
          ? {
              ok: true,
              value: {
                tool,
                options: { mode: "file", file: selected, algorithm, expected },
              },
            }
          : fail("limit");
      }
      case "qrcode": {
        if (value("qr-mode") === "generate")
          return {
            ok: true,
            value: { tool, options: { mode: "generate", input } },
          };
        const selected = file?.files?.[0];
        if (!selected) return fail("empty");
        return selected.size <= 16 * 1024 * 1024
          ? {
              ok: true,
              value: { tool, options: { mode: "decode", file: selected } },
            }
          : fail("limit");
      }
    }
  };
  const renderMatches = () => {
    if (!result?.matches) return;
    const matches = result.matches;
    element<HTMLElement>(root, "[data-regex-results]").hidden = false;
    element<HTMLElement>(root, "[data-regex-summary]").textContent =
      `${matches.length} · ${page + 1} / ${Math.max(1, Math.ceil(matches.length / 50))}`;
    element<HTMLElement>(root, "[data-regex-captures]").textContent =
      JSON.stringify(matches.slice(page * 50, (page + 1) * 50), null, 2);
    element<HTMLButtonElement>(root, "[data-regex-previous]").disabled =
      page === 0;
    element<HTMLButtonElement>(root, "[data-regex-next]").disabled =
      (page + 1) * 50 >= matches.length;
    const highlight = element<HTMLElement>(root, "[data-regex-highlight]");
    highlight.replaceChildren();
    const sample = (source?.value ?? "").slice(0, 65536);
    let cursor = 0;
    for (const match of matches) {
      if (match.start >= sample.length) break;
      highlight.append(
        document.createTextNode(sample.slice(cursor, match.start)),
      );
      const mark = document.createElement("mark");
      mark.textContent = sample.slice(match.start, match.end);
      highlight.append(mark);
      cursor = Math.min(sample.length, match.end);
    }
    highlight.append(document.createTextNode(sample.slice(cursor)));
  };
  const showResult = () => {
    if (!result) return;
    output.value = result.text.slice(0, 65536);
    refreshLineNumbers(output);
    copy.disabled = false;
    download.disabled = false;
    ui.status(
      result.comparison === "match"
        ? e.match
        : result.comparison === "mismatch"
          ? e.mismatch
          : result.text.length > 65536
            ? e.preview
            : e.success,
    );
    if (result.matches) renderMatches();
    if (result.passwords) {
      const list = element<HTMLElement>(root, "[data-password-list]");
      result.passwords.forEach((password, index) => {
        const row = document.createElement("div"),
          text = document.createElement("code"),
          button = document.createElement("button");
        text.textContent = password;
        button.type = "button";
        button.textContent = e.copyOne;
        button.dataset.passwordIndex = String(index);
        row.append(text, button);
        list.append(row);
      });
    }
    if (result.png) {
      const url = URL.createObjectURL(result.png);
      urls.push(url);
      element<HTMLImageElement>(root, "[data-qr-image]").src = url;
      element<HTMLElement>(root, "[data-qr-preview]").hidden = false;
      root
        .querySelectorAll<HTMLButtonElement>("[data-qr-png], [data-qr-svg]")
        .forEach((button) => {
          button.disabled = false;
        });
    }
  };
  const perform = async (action: "format" | "compact") => {
    invalidate();
    const current = revision;
    const request = readJob(action);
    if (!request.ok) {
      ui.error(request.error);
      return;
    }
    const validation = validateEverydayJob(request.value);
    if (!validation.ok) {
      ui.error(validation.error);
      return;
    }
    const job = validation.value;
    const timeout =
      job.tool === "hash" && job.options.mode === "file"
        ? 60000
        : job.tool === "qrcode" && job.options.mode === "decode"
          ? 10000
          : 5000;
    runner = new JobRunner<EverydayJob, EverydayValue>(
      () =>
        new Worker(new URL("./everyday-worker.ts", import.meta.url), {
          type: "module",
        }),
      timeout,
    );
    busy(true);
    ui.status(c.working);
    const outcome = await runner.run(job);
    if (!alive || current !== revision) return;
    busy(false);
    runner = undefined;
    if (!outcome.ok) {
      if (outcome.error.code === "timeout") ui.status(e.deadline, true);
      else ui.error(outcome.error);
      return;
    }
    result = outcome.value;
    showResult();
  };
  const save = (
    data: string | Blob,
    name: string,
    type = "text/plain;charset=utf-8",
  ) => {
    let url = downloads.get(name);
    if (!url) {
      url = URL.createObjectURL(new Blob([data], { type }));
      urls.push(url);
      downloads.set(name, url);
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };
  root
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("[data-option], [data-source]")
    .forEach((input) => {
      input.addEventListener(
        input.type === "file" ||
          input.type === "checkbox" ||
          input instanceof HTMLSelectElement
          ? "change"
          : "input",
        changed,
        options,
      );
    });
  actions.forEach((button) =>
    button.addEventListener(
      "click",
      () =>
        void perform(
          button.dataset.everydayRun === "compact" ? "compact" : "format",
        ),
      options,
    ),
  );
  root.querySelector("[data-password-list]")?.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const password =
        result?.passwords?.[Number(target.dataset.passwordIndex)];
      const current = revision;
      if (password !== undefined)
        void ui.copy(password, () => alive && revision === current);
    },
    options,
  );
  copy.addEventListener(
    "click",
    () => {
      const current = revision;
      if (result)
        void ui.copy(result.text, () => alive && revision === current);
    },
    options,
  );
  download.addEventListener(
    "click",
    () => {
      if (result) save(result.text, `zero-${tool}.txt`);
    },
    options,
  );
  root.querySelector("[data-qr-png]")?.addEventListener(
    "click",
    () => {
      if (result?.png) save(result.png, "zero-qrcode.png", "image/png");
    },
    options,
  );
  root.querySelector("[data-qr-svg]")?.addEventListener(
    "click",
    () => {
      if (result?.svg) save(result.svg, "zero-qrcode.svg", "image/svg+xml");
    },
    options,
  );
  cancel.addEventListener(
    "click",
    () => {
      invalidate();
      ui.error({ code: "cancelled" });
    },
    options,
  );
  element(root, "[data-clear]").addEventListener(
    "click",
    () => {
      if (source) source.value = "";
      if (file) file.value = "";
      for (const key of [
        "pattern",
        "replacement",
        "expected",
        "start",
        "end",
      ]) {
        const input = root.querySelector<HTMLInputElement>(
          `[data-option="${key}"]`,
        );
        if (input) input.value = "";
      }
      changed();
      source?.focus();
    },
    options,
  );
  element(root, "[data-everyday-example]").addEventListener(
    "click",
    () => {
      if (source)
        source.value =
          (
            {
              qrcode: "你好，Zero 😀\n",
              "text-cleanup": "a\na\nb\n",
              hash: "abc",
              regex: "ab ab",
              sql: "select a from t where id = 1",
            } as Partial<Record<EverydayTool, string>>
          )[tool] ?? "";
      if (tool === "hash") control("hash-mode").value = "text";
      if (tool === "qrcode") control("qr-mode").value = "generate";
      if (tool === "regex") {
        control("pattern").value = "(a)(b)";
        control("flags").value = "g";
        control("replacement").value = "$2-$1";
      }
      if (tool === "password") {
        control("length").value = "20";
        control("count").value = "1";
        for (const group of ["uppercase", "lowercase", "digits", "symbols"]) {
          element<HTMLInputElement>(root, `[data-option="${group}"]`).checked = group !== "symbols";
        }
      }
      if (tool === "date-calculator") {
        control("start").value = "2026-11-06";
        control("end").value = "2026-11-09";
        control("date-action").value = "difference";
      }
      if (tool === "cron") {
        control("expression").value = "0 9 * * *";
        control("cron-mode").value = "unix";
        control("timezone").value = "UTC";
        control("baseline").value = "2026-11-08T00:00:00Z";
      }
      changed();
      source?.focus();
    },
    options,
  );
  root.querySelector("[data-regex-previous]")?.addEventListener(
    "click",
    () => {
      if (page > 0) {
        page--;
        renderMatches();
      }
    },
    options,
  );
  root.querySelector("[data-regex-next]")?.addEventListener(
    "click",
    () => {
      if (result?.matches && (page + 1) * 50 < result.matches.length) {
        page++;
        renderMatches();
      }
    },
    options,
  );
  if (tool === "cron") {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) throw new Error("timezone");
      control("timezone").value = zone;
    } catch {
      control("timezone").value = "UTC";
      element<HTMLElement>(root, "[data-timezone-fallback]").hidden = false;
    }
    element(root, "[data-use-now]").addEventListener(
      "click",
      () => {
        control("baseline").value = new Date().toISOString();
        changed();
      },
      options,
    );
  }
  updateMode();
  window.addEventListener(
    "pagehide",
    () => {
      alive = false;
      invalidate();
      if (source) source.value = "";
      if (file) file.value = "";
      root
        .querySelectorAll<HTMLInputElement>("[data-option]")
        .forEach((input) => {
          if (input.type === "text") input.value = "";
        });
      listeners.abort();
    },
    { once: true },
  );
}
