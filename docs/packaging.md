# Zero v0.1.0 试用打包

| Profile | 内置工具 | 用途 |
| --- | --- | --- |
| core | 无 | 测量宿主体积 |
| standard | Awake、Paper、Snap、Launch | 四工具本地试用 |
| full（默认开发） | 上述四工具及 File | 保留现有开发路径 |

core/standard 均在编译阶段排除缺席工具，且不复制 File 引擎资源。安装包名称含版本、配置、平台、架构和格式；安装后均叫 Zero，使用同一 com.watson.ztool 标识与 ~/.zero 数据目录，顺序替换安装。两版不能同时作为不同应用运行。切换配置保留缺席工具记录，当前包不显示它们；现存系统搜索入口不会主动删除，点击缺席工具的旧入口不会启动该工具。

## 本机打包

使用 Node 24、pnpm 10.33.0、Rust stable 和平台原生构建工具：

```bash
pnpm install --frozen-lockfile
pnpm package:desktop --profile core --target aarch64-apple-darwin --ci
pnpm package:desktop --profile standard --target aarch64-apple-darwin --ci
```

产物在 build/packages/core 和 build/packages/standard（被 Git 忽略）。macOS Intel 使用 x86_64-apple-darwin；Windows 在 Windows 上使用 x86_64-pc-windows-msvc。脚本统一控制前端配置和 Cargo features，并使用锁文件。

每组包含安装包、sizes.json、sizes.md、SHA256SUMS.txt。比较同平台/同架构/同格式安装包；bytes 是下载文件原始字节，MiB 为 bytes/1048576。installedAppBytes 单列 macOS .app 的文件内容体积。Windows 不把安装器体积误当安装后体积。

## GitHub Actions 下载

1. 在 Actions 中选择 **Package Zero**，点击 **Run workflow**，profile 选 both/core/standard。
2. 工作流分别构建 Apple Silicon、Intel macOS DMG 和 Windows MSI/NSIS。
3. 完成后在该 run 的 Artifacts 下载对应版本/profile/target ZIP，解压后核对 SHA256SUMS.txt。run summary 可直接查看体积。

手动运行只产生 Actions artifacts，不创建 tag 或 Release。推送与应用版本一致的 v0.1.0 tag 时，构建成功后附加到 **Zero v0.1.0 Draft Release**，保持草稿状态。已发布 Release 的附件拒绝覆盖；不自动发布。

本次为本地试用包，未接入开发者证书签名/Apple 公证或 Windows Authenticode。macOS 默认使用完整 .app 的 ad-hoc 签名（signingIdentity 为 -；如提供 APPLE_SIGNING_IDENTITY 则使用该身份）；下载包可能受 Gatekeeper/Windows SmartScreen 提示限制。File 发行策略保持不变；full 的构建成功不代表其签名引擎已获批准。

## 验证边界

本机构建、前端模块排除、Rust 编译/自动测试、DMG 内容/启动、Hosted Actions 与 Windows 安装实机验证分别记录于 [变更证据](../openspec/changes/package-zero-trial-profiles/evidence/verification.md)。本机证据不代表其他平台通过。
