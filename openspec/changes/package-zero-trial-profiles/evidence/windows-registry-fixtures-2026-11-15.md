# Windows CI 注册表测试目录隔离

调查日期：2026-11-15。原始 [CI run 43599874405](https://github.com/bells/zero/actions/runs/43599874405)，提交 `9aabd04762ff57c0a8b323fe6104f0393ba913df`；失败 job 为 [Check (windows-latest)](https://github.com/bells/zero/actions/runs/43599874405/job/132462146587)。这次失败发生在 CI 的 `Test Rust`，并非 Package Zero 工作流的安装器构建步骤。

## 原始证据

Windows 的 frontend build、File engine audit 和 Cargo check 已通过。Rust `plugin_registry` 集成测试为 16 通过、2 失败：

- `bundled_plugin_records_include_host_manifest_contributions`：初始化 registry 时 atomic replace 报共享冲突 `0x80070020`。
- `corrupt_registry_recovers_with_bundled_plugins`：恢复 registry 时 atomic replace 报源文件不存在 `0x80070002`。

macOS job 通过。当前生产 `PluginRegistry::save` 已在原子替换前 `drop(file)`；不能把这次问题直接当作 2026-10-13 的未关闭 writer 问题重复处理。

## 可复现的缺陷与修复

`src-tauri/tests/plugin_registry.rs` 的 fixture root 仅由 `SystemTime::now().as_nanos()` 拼接，未加入进程序号或原子目录预留。同一时钟读数会让独立测试共享 registry.json 和 staging 路径；并发清理/替换会互相影响。已有 `build_profiles.rs` 的 fixture 使用 PID、原子序号和时间，并预留目录，可作正确参考。

先将原目录命名逻辑抽为接收时间戳的测试 helper，不改变行为，然后增加固定时钟并发回归：32 个 worker 使用相同时间值。旧逻辑确定性失败，实际仅 1 个路径，预期 32 个。修复后以 PID + 进程内 AtomicU64 序号 + 时间戳生成目录，并通过 `create_dir` 立即预留，拒绝意外复用。该回归随后在各自目录中并行 seed、保存不同 Awake 状态、重载验证 revision/状态，再清理自己的目录。

原 CI 日志没有打印各测试的目录，无法据此逐个核对实际碰撞的时间戳；本次确定性回归证明了测试分配器的共享条件，并消除了该条件。Windows 新提交的 hosted 执行仍须确认。

## 验证与限制

- RED：`parallel_registry_fixtures_are_isolated_with_a_fixed_clock`，路径数 1/32，见 `/tmp/zero-windows-registry-collision-red.log`。
- GREEN：`cargo test --manifest-path src-tauri/Cargo.toml --locked --test plugin_registry`，19 通过，0 失败，包括原先失败的两项与新固定时钟并发回归。
- 默认并发完整 `cargo test --manifest-path src-tauri/Cargo.toml --locked`，汇总 489 通过、0 失败、3 ignored；未通过改为串行测试或增加重试来隐藏竞态。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`git diff --check` 通过。
- 尝试 Windows MSVC tests 交叉检查：`TAURI_CONFIG='{"bundle":{"resources":[]}}' cargo check --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --tests`。本机在 `aws-lc-sys` 的 C 依赖阶段因缺少 Windows SDK 的 `windows.h` 失败，尚未完成 Windows 目标检查；没有把该环境失败写成 Windows 编译通过，也未改变依赖/生产代码来绕过。
- 仅修改 registry 测试夹具与本次证据/待办；未改生产原子替换、插件权限、File 引擎审批、安装器配置或 CI 并发设置。未重跑前端或 native UI，因本次没有对应实现变更。
- 修复目前为本地未提交代码。未推送、未替换安装包、未将原提交的重跑当作修复验证。原 Windows 设备/安装包任务继续保持未完成。
