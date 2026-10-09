# 只写诊断 SDK 示例（开发草案）

公开 Web runtime 仍关闭。本目录只是协议/SDK 示例，没有安装入口，不是已发布插件。不要给旧 `ui.message` 自动增加诊断授权。

schema 2 manifest 需要 `permissions: ["diagnostics.write"]`，随后用户在宿主审批中明确批准。事件调用只走宿主注入的 session Bridge，真实 identity、时间、限流和持久化由 Rust 决定。

`reportOperation.ts` 使用仓库 SDK 源码，展示如何在原业务失败之后尝试记录固定代码。宿主不支持方法、权限拒绝或限流时返回 `Result`，不会遮盖原来的业务结果。不记录 error.message，不使用直接 Tauri 或 console fallback。

完整限额、事件目录和安全接入见 [diagnostics.md](../../../docs/diagnostics.md)。这个 helper 并不会让 Host 0.1.0 的公开 runtime 开放。
