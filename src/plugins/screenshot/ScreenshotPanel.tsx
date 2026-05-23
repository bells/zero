import { ScreenshotAction, useScreenshotPlugin } from "./useScreenshotPlugin";

const pendingTools = [
  { key: "rectangle", icon: "□", label: "矩形" },
  { key: "ellipse", icon: "○", label: "圆形" },
  { key: "arrow", icon: "↗", label: "箭头" },
  { key: "pen", icon: "✎", label: "画笔" },
  { key: "mosaic", icon: "▦", label: "马赛克" },
  { key: "text", icon: "T", label: "文字" },
  { key: "pin", icon: "⌖", label: "钉图" },
];

export function ScreenshotPanel() {
  const screenshot = useScreenshotPlugin();

  const launch = (action: ScreenshotAction) => {
    screenshot.start(action);
  };

  return (
    <section className="plugin-panel screenshot-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Capture lab</span>
          <h2>截图工具</h2>
        </div>
        <span className="status-pill active">{screenshot.capabilities.platform}</span>
      </div>

      <div className="capture-preview" aria-label="微信式截图第一阶段预览">
        <div className="mock-sidebar">
          <span />
          <span />
          <span />
        </div>
        <div className="selection-frame">
          <span className="size-badge">901 x 281</span>
          <span className="handle top" />
          <span className="handle right" />
          <span className="handle bottom" />
          <span className="handle left" />
        </div>
        <div className="capture-toolbar">
          {pendingTools.map((tool) => (
            <button
              type="button"
              className="tool-button pending"
              key={tool.key}
              title={`${tool.label}（后续阶段）`}
              disabled
            >
              {tool.icon}
            </button>
          ))}
          <span className="tool-divider" />
          <button
            type="button"
            className="tool-button"
            title="保存"
            onClick={() => launch("save")}
            disabled={screenshot.isBusy}
          >
            ↓
          </button>
          <button type="button" className="tool-button pending" title="撤销（后续阶段）" disabled>
            ↶
          </button>
          <button
            type="button"
            className="tool-button cancel pending"
            title="取消（自定义覆盖层阶段）"
            disabled
          >
            ×
          </button>
          <button
            type="button"
            className="tool-button confirm"
            title="复制到剪贴板"
            onClick={() => launch("copy")}
            disabled={screenshot.isBusy}
          >
            ✓
          </button>
        </div>
      </div>

      <div className="panel-copy">
        <strong>
          {screenshot.capabilities.wechat_visual
            ? "微信式选区和工具条已作为插件界面接入"
            : "当前平台先接入同一插件入口"}
        </strong>
        <span>{screenshot.message}</span>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="primary-action"
          onClick={() => launch("copy")}
          disabled={screenshot.isBusy}
        >
          <span className="button-icon">✓</span>
          截图并复制
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => launch("save")}
          disabled={screenshot.isBusy}
        >
          <span className="button-icon">↓</span>
          截图并保存
        </button>
      </div>
    </section>
  );
}
