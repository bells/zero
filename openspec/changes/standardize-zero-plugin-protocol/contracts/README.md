# 可审阅接口草案

这些文件只服务于提案，不接入应用、不生成发布资产，也不能被当前 Zero 0.1.0 当作可安装示例。

- `plugin-protocol-v1.ts`：Manifest v2、兼容性诊断、SDK 和 Bridge 草案。string 别名只是编辑器提示；SemVer、路径、ID、数值上限和未知字段必须另经运行时校验。
- `example.manifest.json`：未来第三方 Web 示例。`>=0.2.0 <0.3.0` 是本设计建议的首次支持版本窗口，不是当前已发布版本，也没有在本轮修改宿主版本。实施若更改首发版本，须在同一步更新示例和兼容矩阵。
- `plugin-protocol-v1.rs`：与新兼容性 command 输入/输出逐项对齐的 Rust DTO 草案；完整 Rust Manifest 和 Bridge method enum 在实施阶段从契约补齐并验证。本轮不冒称已生成完整 Rust SDK。

`schemaVersion: 2` 标识相对现有无字段格式的结构变化；API 目标为 `1.0.0`，只有端到端验收通过后才作为稳定承诺。两者不是同一个版本。

Public SDK v1 首批仅 `ui.showMessage`、`storage.get/set`、受限 `network.fetch`。现有 clipboard、launcher、wallpaper、process 等声明不自动变成已支持的公开 SDK 方法；后续以独立能力规范扩展。内置 metadata 可表达其现有权限，信任仍只能来自编译注册。
