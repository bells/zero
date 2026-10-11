## Why

Zero Launch 的默认快捷键和重复 Launcher 标签增加操作负担。系统应用启动器只能发现 Zero，无法直接发现并打开内置工具。

## What Changes

- macOS Launch 默认 Option + Space，Windows Ctrl + Alt + Space；显示和冲突反馈与注册保持一致。
- 删除 Launch 面板的 Launcher 标签。
- 为五个内置工具创建系统可索引的应用入口，统一命名 Zero Snap/Awake/Paper/Launch/File。
- 工具入口启动或激活同一个 Zero 实例，在主窗口选择目标工具；禁用工具不被绕过。

## Capabilities

### New Capabilities

- `desktop-tool-discovery`: 系统可索引的工具入口、单实例路由、平台快捷键及紧凑标题。

### Modified Capabilities

无。Launch 现有行为位于未归档 add-quick-launcher-plugin；本增量覆盖其旧默认快捷键，不修改历史证据。

## Impact

Rust 宿主入口、main navigation 对称契约、平台应用入口安装、Launch UI/翻译、官方 tauri-plugin-single-instance。macOS 用户 Applications 和 Windows 用户 Start Menu 中生成可重建入口；不改变标识、数据目录、File 发布策略或截图实现。
