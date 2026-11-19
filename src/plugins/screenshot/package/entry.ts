import {registerPlugin, type PluginContext} from "@zero/sdk";
import "./style.css";

const zh = navigator.language.startsWith("zh");
document.documentElement.lang = zh ? "zh-CN" : "en";
const capture = document.querySelector<HTMLButtonElement>("#capture");
const status = document.querySelector("#status");
if (!capture || !status) throw new Error("Missing Snap controls");

capture.textContent = zh ? "打开系统截图工具" : "Open Snipping Tool";
function bindCapture(context: PluginContext, button: HTMLButtonElement, feedback: Element) {
  button.disabled = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    feedback.textContent = "";
    const result = await context.bridge.request("screen.openSystemCapture", {});
    if (context.signal.aborted) return;
    button.disabled = false;
    feedback.textContent = result.ok
      ? (zh ? "已请求打开系统截图工具。" : "Windows received the request to open Snipping Tool.")
      : (zh ? "无法打开截图工具，请重试。" : "Couldn’t open Snipping Tool. Try again.");
  }, {signal: context.signal});
}

const registration = registerPlugin({activate(context) { bindCapture(context, capture, status); }});
window.addEventListener("pagehide", registration.dispose, {once: true});
void registration.ready.then(result => {
  if (!result.ok) status.textContent = zh ? "Snap 无法启动，请重新打开工具。" : "Snap could not start. Reopen the tool to retry.";
});
