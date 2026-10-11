## Why

为 v0.1.0 本地试用提供无工具与四工具安装包，让用户按同一平台、架构比较下载与安装体积。当前 Release 仅构建五工具版，并沿用旧品牌文案。

## What Changes

- 新增 core（无内置工具）和 standard（Awake、Paper、Snap、Launch）构建配置；现有 full 开发版保持五工具。
- 在 Vite 和 Rust 编译阶段裁剪工具模块、命令、启动任务和依赖；试用配置不携带 File 引擎资源。
- 切换构建配置保留已有工具 registry/data，不在当前配置中显示或启用缺席工具。
- GitHub Actions 手动构建并上传六组带配置/架构名称的产物；版本 tag 构建上传 Draft Release。
- 输出安装包 bytes、MiB、SHA-256，以及 macOS .app 安装体积。

## Capabilities

### New Capabilities

- `desktop-package-profiles`: 构建配置、下载产物和体积测量。

### Modified Capabilities

无。

## Impact

Tauri/Cargo features、React 组合层和 File 路由、registry 兼容、系统入口目录、打包脚本、GitHub Actions。沿用 com.watson.ztool 与 ~/.zero。无新 IPC 合约；现有命令按 feature 注册。不包含签名/公证、File 包审批、公开插件 runtime 开放、自动更新或发布正式 Release。远端提交、推送、tag 和触发由用户另行授权。
