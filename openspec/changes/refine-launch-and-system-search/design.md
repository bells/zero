## Context

见 proposal.md。主窗口已使用 revision 快照避免事件早于监听器丢失，工具由注册表和可见性偏好管理。系统启动器索引应用/快捷方式，而非 React 页面。

## Goals / Non-Goals

**Goals:** 复用宿主导航、让五工具被应用搜索发现、保持单实例和禁用边界。
**Non-Goals:** 任意命令执行、第三方插件搜索入口、改变 File 发布政策、承诺 Alfred/Spotlight 即时索引。

## Decisions

- 采用官方 tauri-plugin-single-instance（已核对本机 2.4.2 源码），以白名单 `--zero-tool <snap|awake|paper|launch|file>` 路由。相比自建 socket/锁文件，复用官方平台适配。
- macOS 为已打包 release Zero 创建 ~/Applications/Zero Tools/*.app 薄入口，使用安全引用的 `/usr/bin/open -n -a <Zero.app> --args ...`；Windows 使用现有 windows crate 的 IShellLinkW/IPersistFile 写用户开始菜单 .lnk。不以深链注册冒充可搜索应用；debug 构建不安装持久入口；macOS 打包 debug 可通过 ZERO_DESKTOP_ENTRIES_TEST_ROOT 仅在临时目录验证。
- 写入限定宿主拥有目录，带 ownership marker，拒绝符号链接和不属于 Zero 的同名内容。后台执行、幂等内容比较、路径变化时更新，失败写安全诊断，不阻断启动。
- Rust/TS main navigation 新增可选 pluginId，带 revision 保留目标；前端等待已加载插件且只选择可见工具。普通导航清空目标。禁用或隐藏工具入口打开主窗口但不自动恢复/运行工具。
- 快捷键显示复用原生 global-shortcut status 中 accelerator；注册失败仍显示同一值，翻译冲突信息避免硬编码旧按键。
- Launch 快捷键复用状态栏已有的可见性切换：未创建/隐藏时显示，显示时隐藏，仅影响 launcher 窗口；Zero 宿主继续运行。

## Risks / Trade-offs

- [索引延迟/Alfred 搜索范围] → 使用标准应用目录，文档说明索引刷新与用户设置。
- [Zero 移动后入口失效] → 每次已打包应用启动同步目标路径；移除入口目录可回滚，下次启动重建。
- [Windows 无本机设备] → 平台编译和源码契约单独记录；实机门禁不勾选。
- [自动生成的 macOS 入口不是签名发行包] → 只含本机生成的转发脚本，签名发行安装/干净机器门禁独立保留。

## Migration Plan

新默认快捷键是注册常量，不覆盖用户数据。保持 com.watson.ztool 与原存储兼容。新增契约 pluginId 省略时仍保持旧导航行为。删除 Zero Tools 目录并回退代码可以移除工具入口。
