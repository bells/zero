import {registerPlugin, type ZeroBridge} from "@zero/sdk";
import {useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {createRoot} from "react-dom/client";
import {loadIndex, loadUsage, saveUse, type LaunchIndex} from "./host.js";
import {searchApplications, type Usage} from "./search.js";
import {launcherResultShortcut, launcherShortcutIndex} from "./shortcuts.js";
import "./style.css";

const chinese = navigator.language.startsWith("zh");
document.documentElement.lang = chinese ? "zh-CN" : "en";
const text = chinese ? {
  search: "搜索应用", refresh: "刷新", loading: "正在索引应用…", list: "已安装应用",
  empty: "找不到匹配的应用。", indexError: "无法读取应用列表，请刷新重试。",
  stale: "应用已变更或列表已过期，请刷新后重试。",
  openError: "Zero 无法确认已打开应用。请先检查桌面，再重试。",
  launchError: "Launch 无法启动，请重新打开工具。",
} : {
  search: "Search apps", refresh: "Refresh", loading: "Indexing applications…", list: "Installed applications",
  empty: "No matching applications.", indexError: "Couldn’t load the application list. Refresh to retry.",
  stale: "The application changed or the list expired. Refresh and try again.",
  openError: "Zero couldn’t confirm the application opened. Check your desktop before retrying.",
  launchError: "Launch could not start. Reopen the tool to retry.",
};

function LaunchView({bridge}: {bridge: ZeroBridge}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<LaunchIndex | null>(null);
  const [usage, setUsage] = useState<Usage>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const operation = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => searchApplications(index?.items ?? [], query, usage, Date.now()), [index, query, usage]);
  const selected = items.findIndex(item => item.id === activeId);
  const cursor = selected < 0 ? 0 : selected;
  const current = items[cursor];

  const refresh = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    setFailure(null);
    const result = await loadIndex(bridge);
    if (result.ok) {
      setIndex(result.value);
      setActiveId(null);
    } else {
      setFailure(text.indexError);
    }
    operation.current = false;
    setLoading(false);
  }, [bridge]);

  useEffect(() => {
    input.current?.focus();
    void refresh();
    void loadUsage(bridge).then(setUsage);
  }, [bridge, refresh]);

  useEffect(() => {
    if (current) document.getElementById(`app-${current.id}`)?.scrollIntoView({block: "nearest"});
  }, [current]);

  async function activate(id: string) {
    if (operation.current || !index || !items.some(item => item.id === id)) return;
    operation.current = true;
    setBusy(true);
    setFailure(null);
    const result = await bridge.request("apps.activate", {catalogId: index.catalogId, itemId: id});
    if (result.ok) {
      const updated = await saveUse(bridge, id, Date.now());
      if (updated) setUsage(updated);
    } else {
      setFailure(["apps.staleCatalog", "apps.targetChanged"].includes(result.error.code) ? text.stale : text.openError);
    }
    operation.current = false;
    setBusy(false);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const shortcut = launcherShortcutIndex(event.nativeEvent, "macos");
    if (shortcut !== null) {
      const item = items[shortcut];
      if (item) {
        event.preventDefault();
        void activate(item.id);
      }
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      void activate(current.id);
    } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && items.length) {
      event.preventDefault();
      const next = event.key === "ArrowUp" ? cursor - 1 : cursor + 1;
      setActiveId(items[(next + items.length) % items.length]?.id ?? null);
    }
  }

  return <main>
    <div className="toolbar">
      <input ref={input} type="search" aria-label={text.search} placeholder={text.search}
        role="combobox" aria-controls="applications" aria-expanded={items.length > 0}
        aria-activedescendant={current ? `app-${current.id}` : undefined}
        maxLength={128} value={query} onKeyDown={handleKey}
        onChange={event => {setQuery(event.currentTarget.value); setActiveId(null);}} />
      <button type="button" onClick={() => void refresh()} disabled={loading || busy}>{text.refresh}</button>
    </div>
    {failure && <p className="error" role="alert">{failure}</p>}
    {loading && <p role="status">{text.loading}</p>}
    {!loading && index && !items.length && <p role="status">{text.empty}</p>}
    <ul id="applications" role="listbox" aria-label={text.list} aria-busy={loading || busy}>
      {items.map((item, row) => <li key={item.id} role="presentation">
        <button id={`app-${item.id}`} type="button" role="option" aria-selected={item.id === current?.id}
          aria-keyshortcuts={launcherResultShortcut(row, "macos")?.ariaKeyShortcuts}
          disabled={loading || busy} onClick={() => void activate(item.id)}>
          <span>{item.title}</span>
          {row < 9 && <kbd>{launcherResultShortcut(row, "macos")?.label}</kbd>}
        </button>
      </li>)}
    </ul>
  </main>;
}

const registration = registerPlugin({activate(context) {
  const node = document.getElementById("root");
  if (!node) throw new Error("Missing Launch root");
  const root = createRoot(node);
  root.render(<LaunchView bridge={context.bridge}/>);
  context.subscriptions.push({dispose: () => root.unmount()});
}});
window.addEventListener("pagehide", registration.dispose, {once: true});
void registration.ready.then(result => {
  if (result.ok) return;
  const node = document.getElementById("root");
  if (node) {
    node.setAttribute("role", "alert");
    node.textContent = text.launchError;
  }
});
