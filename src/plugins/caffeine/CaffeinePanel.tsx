import { useCaffeinePlugin } from "./useCaffeinePlugin";

export function CaffeinePanel() {
  const caffeine = useCaffeinePlugin();

  return (
    <section className="plugin-panel caffeine-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Power guard</span>
          <h2>咖啡因模式</h2>
        </div>
        <span className={caffeine.enabled ? "status-pill active" : "status-pill"}>
          {caffeine.enabled ? "保持唤醒" : "正常休眠"}
        </span>
      </div>

      <div className="caffeine-dial" aria-hidden="true">
        <div className={caffeine.enabled ? "dial-core active" : "dial-core"}>
          <span>{caffeine.enabled ? caffeine.elapsed : "OFF"}</span>
        </div>
      </div>

      <div className="panel-copy">
        <strong>{caffeine.enabled ? "屏幕和系统将持续保持活跃" : "系统会按原设置进入休眠"}</strong>
        <span>{caffeine.message}</span>
      </div>

      <button
        type="button"
        className={caffeine.enabled ? "primary-action danger" : "primary-action"}
        onClick={caffeine.toggle}
        disabled={caffeine.isBusy}
        aria-pressed={caffeine.enabled}
      >
        <span className="button-icon">{caffeine.enabled ? "×" : "✓"}</span>
        {caffeine.enabled ? "关闭咖啡因" : "开启咖啡因"}
      </button>
    </section>
  );
}
