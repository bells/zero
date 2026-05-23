import { PluginMeta } from "../types";

interface AboutPanelProps {
  plugins: PluginMeta[];
}

export function AboutPanel({ plugins }: AboutPanelProps) {
  return (
    <section className="plugin-panel system-panel about-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">About</span>
          <h2>关于 ZTool</h2>
        </div>
        <span className="status-pill">v0.1.0</span>
      </div>

      <div className="about-mark">Z</div>

      <div className="panel-copy">
        <strong>一个托盘优先的工具集合应用</strong>
        <span>每个工具都是独立插件，当前已接入截图工具和咖啡因模式。</span>
      </div>

      <div className="about-grid">
        <span>插件数量</span>
        <strong>{plugins.length}</strong>
        <span>运行方式</span>
        <strong>Tray App</strong>
      </div>
    </section>
  );
}
