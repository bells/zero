import { registerPlugin } from "../../src/sdk/index";
const textarea = document.querySelector<HTMLTextAreaElement>("#note")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const registration = registerPlugin({
  async activate(context) {
    const result = await context.bridge.request("storage.get", { key: "note" });
    if (!result.ok) throw new Error(result.error.message);
    textarea.value = typeof result.value === "string" ? result.value : "";
    status.textContent = "Ready / 就绪";
    save.disabled = false;
    const onSave = async () => {
      save.disabled = true;
      const result = await context.bridge.request("storage.set", { key: "note", value: textarea.value });
      if (context.signal.aborted) return;
      status.textContent = result.ok ? "Saved / 已保存" : result.error.message;
      save.disabled = false;
    };
    save.addEventListener("click", onSave);
    context.subscriptions.push({ dispose: () => save.removeEventListener("click", onSave) });
  },
});
void registration.ready.then(result => { if (!result.ok) status.textContent = result.error.message; });
window.addEventListener("pagehide", () => registration.dispose(), { once: true });
