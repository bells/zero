import {createRoot} from "react-dom/client";
import {registerPlugin, type ZeroBridge} from "@zero/sdk";
import {errorMessage, text} from "./i18n.js";
import {useConversion} from "./useConversion.js";
import "./style.css";

document.documentElement.lang = text.language;

function FilePanel({bridge}: {bridge: ZeroBridge}) {
  const ui = useConversion(bridge);
  const dialogLabel = ui.dialog === "input" ? text.picking : text.starting;
  const error = ui.error ?? (ui.job?.status === "failed" ? ui.job.errorCode : null);
  const input = ui.input;
  const job = ui.job;
  const busy = ui.active || ui.dialog !== null;

  return <main>
    <header><h1>{text.title}</h1></header>
    <section className="selection">
      {input ? <>
        <p className="fileName">{input.fileName}</p>
        <p>{text[input.direction]}</p>
        <p className="hint">{input.direction === "pdfToDocx" ? text.pdfHint : text.docxHint}</p>
      </> : <p>{text.empty}</p>}
      <div className="actions">
        <button type="button" className={input ? undefined : "primary"}
          disabled={busy} onClick={() => void ui.chooseInput()}>
          {input ? text.change : text.select}
        </button>
        {input && <button type="button" className="primary" disabled={busy}
          onClick={() => void ui.start()}>{text.chooseDestination}</button>}
      </div>
    </section>

    {ui.dialog && <p role="status">{dialogLabel}</p>}
    {job && <section className="job">
      <div className="jobInfo">
        <strong role="status">{job.status === "running" && job.stage ? text[job.stage] : text[job.status]}</strong>
        <p className="fileName">{job.outputName}</p>
      </div>
      {ui.active && <>
        <progress aria-label={text.running} max={100} value={job.percent ?? undefined} />
        <button type="button" className="cancel" onClick={() => void ui.cancel()}
          disabled={ui.cancelPending || job.status === "cancelling"}>{text.cancel}</button>
      </>}
      {job.status === "completed" && <button type="button" onClick={() => void ui.reveal()}>
        {text.reveal}
      </button>}
    </section>}
    {error && <p className="error" role="alert">{errorMessage(error)}</p>}
  </main>;
}

const registration = registerPlugin({activate(context) {
  const node = document.getElementById("root");
  if (!node) throw new Error("Missing File root");
  const root = createRoot(node);
  root.render(<FilePanel bridge={context.bridge} />);
  context.subscriptions.push({dispose: () => root.unmount()});
}});
window.addEventListener("pagehide", registration.dispose, {once: true});
void registration.ready.then(result => {
  if (result.ok) return;
  const node = document.getElementById("root");
  if (node) {
    node.setAttribute("role", "alert");
    node.textContent = text.failedToOpen;
  }
});
