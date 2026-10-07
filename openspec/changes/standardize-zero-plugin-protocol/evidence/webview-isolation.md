# WebView 隔离决策与原生探针

2026-09-27，本机 macOS WKWebView。用户明确选择独立 WebView 工具窗口，main/tray 保留入口；不改变五个内置工具容器。以下是原生合成探针结果，不是 Windows 或签名应用发布证明。

## 决策依据

`src-tauri/examples/plugin_isolation_probe.rs` 在临时窗口运行无限循环，宿主每 250ms 发送心跳，原生计时器退出。首轮 iframe 的心跳在 2850ms 后停止；独立 WebView 首轮从 732ms 持续到 6271ms。它们使用专用 zero-probe 资源，不访问用户 registry。

增强探针复用生产 `invoke_gate`，还验证原始 IPC 和原生销毁：

```text
ZERO_PROBE /command-denied at 722ms
ZERO_PROBE /capability-denied at 724ms
ZERO_PROBE /plugin-ready at 724ms
ZERO_PROBE /plugin-blocking at 2725ms
ZERO_PROBE destroy requested at 4582ms
ZERO_PROBE destroy dispatched: Ok(())
ZERO_PROBE window removed: true
ZERO_PROBE host heartbeat milliseconds: [973, 1224, 1474, 1724, 1974, 2225, 2478, 2730, 2982, 3233, 3486, 3738, 3990, 4241, 4493, 4746, 4998, 5249, 5501, 5754, 6007, 6258, 6510]
```

沙箱内首轮无法连接 macOS 桌面服务，未取得结果；随后获准沙箱外运行，以上为该次原生结果。旧 /tmp 日志已在会话恢复后消失，本文件保留工具实际返回的关键输出；后续日志写入忽略的 build/plugin-verification。

```bash
ZERO_PLUGIN_PROBE_LAYOUT=window cargo run --manifest-path src-tauri/Cargo.toml --locked --example plugin_isolation_probe
```

## notes 原生闭环

`plugin_web_smoke.rs` 使用独立临时 registry，安装本地生成的 notes 包，驱动其实际 HTML/SDK；不接触 ~/.zero。开发包摘要：`c35bd18dee135ab0271bc3f43a7a4343e7d294ed4ba8ce6cdc4de06652ce2f98`。

```text
ZERO_WEB_SMOKE first storage commit passed
ZERO_WEB_SMOKE re-enable, generation revocation, restore and uninstall data preservation passed
ZERO_WEB_SMOKE result=Ok(())
```

第一版 smoke 在最后一个插件窗口关闭后提前正常退出，只证明首次存储成功；修正探针保留宿主窗口后才完成上面的完整断言。不要把第一版的 exit 0 当作完整通过。

```bash
node scripts/package-plugin-notes.mjs --development
ZERO_PLUGIN_WEB_DEV=1 cargo run --manifest-path src-tauri/Cargo.toml --locked --example plugin_web_smoke -- build/plugin-notes-development.zplugin
```

正式 public runtime 常量仍关闭。开发覆盖仅在 macOS debug 构建有效，仍检查真实宿主版本；开发包明确声明 0.1.x，默认作者示例仍声明拟议的 0.2.x。后续源码变化须重跑此探针。本结果不涵盖 Windows、独立签名安装包、10 次 RSS/CPU 测量或全部五工具 GUI smoke。
