# 独立插件包：当前开发入口

更新：2026-11-14。这里记录 `enable-core-market-tools` 的第一阶段源码能力；不代表现有安装包已支持市场中的五个工具。正式 Web runtime、五工具迁移、原生设备验收与官方包发布仍需分别完成。

## 归属与依赖

工具拥有界面、领域逻辑、配置迁移、翻译、资源、版本与测试，只通过公开 SDK 使用宿主能力。工具不能导入另一个工具、宿主内部实现或 Tauri API。core 将提供受控原生 provider；native 队列/租约/资源与权限仍由 Rust 管理。后台业务入口属于工具包，不等同于一个常驻工具页面。

公开类型已经归入 [`src/sdk/`](../../src/sdk/README.md)，宿主以兼容 re-export 使用；SDK 不携带宿主 registry DTO。可在不复制 `src/core` 的情况下单独构建：

```sh
node scripts/build-plugin-sdk.mjs --output /tmp/zero-plugin-sdk
```

输出目录必须为空。输出是私有本地 `@zero/sdk` 包，尚未发布 npm。`@zero/sdk/react` 为可选 React 接口。

## 构建与检查一个包

单工具根目录拥有自己的清单、源码、package manifest 和锁文件。详见[构建器契约与限制](../../scripts/plugin-packages/README.md)。

```sh
node scripts/plugin-packages/build.mjs build /absolute/tool-root /absolute/sdk-source-root /absolute/output
node scripts/plugin-packages/build.mjs check /absolute/output/example.tool-1.0.0.zplugin
```

构建器使用现有 TypeScript AST、Vite 与 JSZip，检查传递导入、声明依赖、真实路径和 HTML/CSS 资产所有权。只构建选中的插件，生成根目录带 `manifest.json` 的确定性归档；不会运行插件自己的 Vite/PostCSS 配置、安装脚本或环境文件。取消、时间、源字节、压缩/展开字节和文件数均有限额。

HTML 检查绑定仓库锁定的 Vite 资产规则与其 HTML parser；上游内部布局变更时失败关闭。它拒绝未实现安全解析的资产语法，不试图成为任意 JavaScript 的运行时沙箱。`publisherVerified:false` 和 `releaseApproved:false` 明确表示构建成功没有授予官方身份、原生权限或发行批准。

## 能力与后台声明

v2 manifest 新增两个可选字段，缺席时保留旧行为：

```json
{
  "requiredCapabilities": [{ "id": "storage.plugin", "version": "^1.0.0" }],
  "background": { "main": "dist/background.js", "events": ["schedule.refresh"] }
}
```

这里只展示字段形状，不是完整或可运行的工具 manifest。Rust/SDK/作者校验使用同一范围约束，拒绝未知字段、null、重复能力、无界范围和不安全后台路径。归档必须确实含声明的普通后台脚本文件；symlink、特殊文件和逃逸路径被拒绝。

`get_plugin_host_capabilities` 与前端 `pluginHostService.capabilities()` 返回对称的 `hostVersion/apiVersion/runtimeEnabled/capabilities`。当前仅报告已接入隔离 Bridge 的 storage/message/diagnostics；network、power、capture 和后台调度不因源码中已有私有 command 而自动可用。实际兼容校验使用相同 catalog；含后台入口的包还隐含要求 `background.events ^1.0.0`。缺失时即使包结构合法也不能标记 ready。

## 官方身份

官方 `.zplugin` 的身份校验有独立 [signature envelope schema](../../schemas/plugin-publisher-signature-v1.schema.json) 和 Rust verifier。签名绑定 schema/key ID、plugin ID/version、实际归档 SHA-256，使用固定域分隔二进制载荷。信任表公钥及 exact ID 范围是宿主输入，不能从包自称 official 或 `source: bundled` 推断。

目前交付了校验器、SDK 类型与共享正反夹具；尚未配置生产信任公钥、接入全部安装事务或生成可发行的官方工具包。验证成功只证明身份，不授予 permissions；File engine 仍使用其独立签名与审批 policy。

后续迁移归属、33 项实施任务和证据见[变更目录](../../openspec/changes/enable-core-market-tools/proposal.md)及[五工具归属地图](../../openspec/changes/enable-core-market-tools/evidence/ownership.md)。
