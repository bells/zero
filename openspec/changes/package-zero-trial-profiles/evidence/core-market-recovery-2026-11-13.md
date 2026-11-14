# Core 市场与恢复反馈修复

日期：2026-11-13。来源为维护者安装 `Zero_0.1.0_core_macos_aarch64_dmg.dmg` 后的两张截图。本记录不代表已替换 Release 附件或修复了已安装应用。

## 根因与范围

- 默认市场源指向仓库根 `market.json`；GitHub 读取该路径返回 404，本地也不存在该文件。原请求未检查 HTTP 状态，导致 `404: Not Found` 被传入 JSON 解析器，复现截图中的 integer `404` 错误。
- core 的前端 catalog 和 Rust metadata 都为空。恢复只遍历编译进来的工具，但空目录仍保存 registry 并返回成功；界面无条件显示“已恢复内置工具”。
- GitHub Release 元数据中的 standard macOS Apple Silicon 附件存在。core 用于宿主体积测量；四工具试用应选择 standard。原生模块不能通过恢复记录或安装外部 `.zplugin` 动态加入 core。

修复新增合法空 [market.json](../../../../market.json)，使用既有 reqwest 在解析前检查 HTTP 状态并设置连接/总请求超时；错误保留已缓存市场。core 的恢复在写盘前返回错误，前端依据 Vite profile 能力禁用恢复按钮并显示中英文安装说明；空工作区和空市场也解释工具获取方式。IPC 签名未变。没有添加扩展包、放开公开 Web runtime、改 File 签名门禁、删除用户数据或修改远程 Release。

## 回归与构建证据

- 先运行失败测试：core 恢复返回 `Ok([])`；默认索引文件缺失；本机 HTTP 404 被解析为 JSON。修复后 core 的 profile 与市场专项共 11 项通过，包括不写盘、不推进 revision、保留缓存。
- 404 测试的首次修复后沙箱运行因本机临时端口监听被拒绝失败；保留结果后，在获准的沙箱外重跑通过。
- `pnpm test`：502 通过，0 失败。
- `pnpm build`、`ZERO_BUILD_PROFILE=core pnpm build`、`ZERO_BUILD_PROFILE=standard pnpm build` 全部通过；core 工具模块数为 0，standard 包含四工具，full 包含五工具。
- `node scripts/performance/build-graph.mjs --check --output /tmp/zero-core-market-build-graph.json` 通过，未改写历史构建证据。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml --locked` 通过。
- 默认并发 `cargo test --manifest-path src-tauri/Cargo.toml --locked` 首轮：353 通过、1 失败、2 ignored；失败项为既有 `services::ocr::scheduling_tests::timeout_keeps_native_slot_and_queue_is_bounded`，在 `src/services/ocr/mod.rs:449` 断言 admission permits 为 3，实际为 2。本轮未修改 OCR。
- 保留首轮结果后，用 `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` 完整重跑：合计 468 通过、0 失败、3 ignored。此结果表明串行回归通过，不代表 OCR 并发时序风险已消除。
- `pnpm exec tsc --noEmit`、`openspec validate --all --strict`（46 项）、`git diff --check` 通过。

## 原生与交付边界

- `ZERO_BUILD_PROFILE=core pnpm tauri dev --no-watch -- --no-default-features` 已启动 Vite 并编译运行 `target/debug/zero`，检查后停止。
- Computer Use 的 inventory 与 Zero app 连接分别超时，未能观察真实按钮、窗口或点击结果。不能据启动日志宣称原生界面验收完成；Windows 安装设备验收也未执行。
- 本地市场文件需提交并进入远程 main 才能服务现有客户端；HTTP 检查和 UI 修复需重新打包安装。此次未提交、推送、发布或覆盖附件，未更新历史安装包的行为。
- 当前可用路径：退出 Zero，使用同一 Release 的 standard 安装包替换应用，保留 `~/.zero`。这能提供 Snap、Awake、Paper、Launch；不包含 File，也不代表市场已有可下载扩展。
