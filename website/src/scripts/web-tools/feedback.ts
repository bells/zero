import { isFeedbackMessage } from "../../lib/feedback/config";
for (const root of document.querySelectorAll<HTMLElement>("[data-feedback]")) {
  const trigger = root.querySelector<HTMLButtonElement>("[data-feedback-open]");
  const region = root.querySelector<HTMLElement>("[data-feedback-region]");
  const host = root.querySelector<HTMLElement>("[data-feedback-host]");
  const close = root.querySelector<HTMLButtonElement>("[data-feedback-close]");
  const retry = root.querySelector<HTMLButtonElement>("[data-feedback-retry]");
  const status = root.querySelector<HTMLElement>("[data-feedback-status]");
  const origin = root.dataset.origin;
  const thread = root.dataset.thread;
  const locale = root.dataset.feedbackLocale;
  if (
    !trigger ||
    !region ||
    !host ||
    !close ||
    !retry ||
    !status ||
    !origin ||
    origin === location.origin ||
    ![
      "tools",
      "tools/timestamp",
      "tools/json",
      "tools/base64",
      "tools/diff",
      "tools/image-converter",
      "tools/image-watermark",
      "tools/image-compressor",
      "tools/markdown",
    ].includes(thread || "") ||
    !["zh", "en"].includes(locale || "")
  )
    continue;
  let frame: HTMLIFrameElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    clearTimeout(timer);
    frame?.remove();
    frame = null;
  };
  const fail = () => {
    dispose();
    status.textContent = root.dataset.failure || "";
    retry.hidden = false;
  };
  const open = () => {
    dispose();
    region.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    retry.hidden = true;
    status.textContent = root.dataset.loading || "";
    frame = document.createElement("iframe");
    frame.title = root.querySelector("h2")?.textContent || "Feedback";
    frame.referrerPolicy = "no-referrer";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms",
    );
    frame.allow =
      "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'";
    frame.src = `${origin}/?threadId=${encodeURIComponent(thread!)}&locale=${locale}`;
    const current = frame;
    frame.addEventListener(
      "error",
      () => {
        if (frame === current) fail();
      },
      { once: true },
    );
    host.append(frame);
    timer = setTimeout(fail, 12000);
  };
  trigger.hidden = false;
  trigger.addEventListener("click", open);
  retry.addEventListener("click", open);
  close.addEventListener("click", () => {
    dispose();
    region.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  });
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.origin !== origin ||
      !frame ||
      event.source !== frame.contentWindow ||
      !isFeedbackMessage(event.data)
    )
      return;
    if (event.data.type === "ready") {
      clearTimeout(timer);
      status.textContent = "";
    } else if (event.data.type === "resize")
      frame.style.height = `${Math.ceil(event.data.height)}px`;
    else fail();
  });
  window.addEventListener("pagehide", dispose);
}
