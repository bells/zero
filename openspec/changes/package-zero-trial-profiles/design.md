## Context

内置工具是编译时模块；单纯隐藏菜单不能用于比较真实包大小。File 的候选引擎未获批准，本次两个试用版本均排除它。

## Decisions

- Cargo 使用 bundled-tools 与 file-tool 两组 feature，默认同时启用；打包脚本传 --no-default-features 和配置对应的 features。
- Vite 编译时选择 full/core/standard catalog，常量消除 File 引擎路由；非 full 配置禁用 public 目录复制，防止残留引擎资产泄漏。
- 保留缺席工具的磁盘记录，registry runtime partition 只暴露实际已编译工具。保存时合并排除记录，避免切换配置损坏既有状态；缺席的第一方工具安装在 preflight 拒绝。
- 应用名称、版本、标识和数据路径保持一致。产物名称区分 profile/platform/architecture/installer kind。用户顺序替换安装，两版不能作为独立应用同时运行。
- 使用 Tauri 官方 CLI 与 GitHub 官方 upload/download-artifact，避免自行实现安装包格式。手动 workflow 无 tag/Release 写入；tag workflow 只创建/更新 Draft，拒绝覆盖已发布版本。
- size 清单按完整安装包 bytes 计量；macOS installedAppBytes 按 .app 文件内容总大小计量，不能与压缩包大小混淆。

## Verification

检查所有配置的 Rust 编译、干净/既有 registry、Vite 实际模块图与资源排除；默认开发版前端/Rust回归、生产构建和性能门禁。生成本机 Apple Silicon DMG 并检查包内容/启动。GitHub macOS Intel、Windows 构建与安装实机证据单列，不从本机编译推断。
