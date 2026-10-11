## Context

动机见 [proposal.md](proposal.md)。2026-10-09 已核对当前代码、PRODUCT.md 与现有变更：

- `CaffeinePanel` 共享于托盘和 main，包含 POWER、96px 装饰旋转圆盘、两行重复状态说明、时长网格、两个计时卡片和底部按钮；宿主托盘已采用单行导航和独立内容滚动，窗口仍为 400×500。
- `CaffeineSnapshot` 使用 snake_case，Rust 的 `ALLOWED_DURATION_MINUTES` 和 TS 的 `CAFFEINE_DURATION_OPTIONS` 已支持无期限及 5/10/15/30/60/120/300 分钟。切换时长重建会话，generation 防止旧计时器关闭新会话。
- macOS 状态栏实际上是一张组合图片和多个命中单元，原生右键菜单由命中 item ID 构建；不能增加独立 Awake tray 实例。现有工具菜单只有“退出 Zero 状态栏”，执行的是全应用退出。
- 前端当前只在面板重新激活和到期时读取 snapshot，菜单修改状态需要额外同步。隐藏展示计时暂停规则已实现，必须保留。
- 现有状态栏可见性持久化到 `status-bar.json`；`visible_plugin_items` 按 ID 合并，更新时不能覆盖其他工具。偏好本身与唤醒会话分离。

参考核对：[KeepingYouAwake](https://github.com/newmarcel/KeepingYouAwake) 的 `ActiveIcon.imageset`、`InactiveIcon.imageset`、`KYAStatusItemController.m` 和 `KYAActivationDurationsMenuController.m`，本次读取的 main 树 SHA 为 `2be93dd7f390b23fbca934ff3b1ac03468a80077`。该项目采用独立 active/inactive 图片、右键显示菜单、时长菜单勾选当前会话。仅借鉴状态对比与熟悉的菜单交互，不复制其软件身份或原生框架。

用户提供的 `Pasted image 20261009192753.png` 在本轮消息中仅有文件名，工作区未找到对应图片；当前布局问题依据用户描述与源代码确定，实施时需截图校验，不能把文件名当作已审阅的图像。

## Goals / Non-Goals

**Goals:**

- 明确“选时长并开启”“关闭会话”“退出 Awake”三个动作的结果，入口隐藏与后台唤醒不发生意外脱节。
- 让两个面板共用 hook、状态与动作，但按 surface 区分布局：托盘简洁，main 使用完整工作区和圆盘，保留状态、时长和错误信息。
- 图标、菜单勾选、计时和动作由同一原生会话状态驱动，菜单点击不在 UI 线程执行进程工作。

**Non-Goals:**

- 不创建独立 Awake 窗口／进程，不改共享导航、关于或其他工具布局，不更换 Zero 整套品牌图标。
- 不增加自定义时长、电量策略、合盖唤醒或自动恢复唤醒；不修改插件启用／安装状态和第三方权限协议。
- 不扩大平台支持，不顺带同步或归档其他 OpenSpec 变更。

## Decisions

### 1. 托盘使用紧凑信息行，主窗口保留圆盘和完整工作区

按 `impeccable` 产品界面规则沿用项目系统字体、克制语义色、熟悉按钮和显式状态。移除 POWER、`panel-copy` 中正常状态的两行说明，托盘中移除圆盘，main 保留圆盘计时；错误反馈保留为独立可访问区域。正常信息层级如下，示意仅表示结构：

```text
托盘 Awake 内容区
Zero Awake                         保持唤醒
已运行  12:34                 当前  无期限
持续时长
[ 无期限 ] [ 5 分钟 ] [ 10 分钟 ] [ 15 分钟 ]
[ 30 分钟] [ 1 小时 ] [ 2 小时  ] [ 5 小时  ]
[                关闭咖啡因                 ]
```

有限会话在计时区增加“剩余 04:32”，剩余时间只出现一次；未运行显示“正常休眠”、已运行 00:00 和待开启时长，按钮为“开启咖啡因”。按钮高度至少 44px，时长目标高度至少 36px，在有触摸输入的布局提高到 44px；完整本地化名称进入可访问标签。计时数字采用 tabular-nums，无每秒 live region 播报。选择时长与当前状态的标识不能只靠颜色。

默认 400×500 托盘，中英文、正常未运行／有限／无期限状态下，全部预设及完整主按钮在首屏可见，宿主底部系统动作仍可见。短窗口、字体放大或多行错误时保留内容滚动，主按钮置于稳定的底部操作区，不以 `overflow:hidden` 截断内容。CSS 只针对 Awake，必要时增加显式 surface variant，不用全局 `.plugin-panel` 缩放解决。

2026-10-11 用户验收修正：每个插件均遵循“状态栏工具页简洁、主界面工具页可更丰富”的原则，已写入 AGENTS.md 和 PRODUCT.md。main 取消 480px 最大宽度，面板填满可用工作区：左侧恢复原有配色的圆盘，中央显示已运行时间；右侧为当前时长、一次有限剩余和八个预设，底部保留完整主动作。圆盘静态表达运行状态，数字保持正向，不增加装饰性旋转。托盘仍使用紧凑信息行且不显示圆盘。两种布局沿用同一 panel/hook 和 Rust 权威计时，不增加 IPC 或前端到期逻辑。

main 保留唯一工具标题，已运行数字只显示一次；窄工作区改为上下排列，异常长文或错误允许滚动，所有控制可达。验证 920×660、760×520、侧栏展开／收起、中英文和正常三状态。原 2026-10-09 紧凑 main 截图仅是历史记录，本次以新验收补充为准。

**取舍：** 共享状态与动作不要求共享信息密度。托盘先保证快速操作，main 用圆盘和更完整的布局利用空间；无需新增依赖，复用 React、CSS 和已有圆盘配色。

### 2. 运行状态改为实心杯体，外部几何稳定

未运行保留 steam-free 空杯轮廓；运行以杯体内部的大面积单色填充表达活跃状态，杯口保留必要负空间，手柄和底座不变。不依赖一条细液面线或颜色。沿用 24×24 SVG、currentColor、共享外部 stroke/clear space 和透明原生 PNG，macOS 继续 Template Image。实心杯是唯一活跃派生身份，不加闪烁或蒸汽。

更新 SVG masters、React mask 派生、tray PNG、contact sheet 和图标校验中“一条液面线／全图同路径”假设。外部几何／命中区域等价仍需校验，但不能用旧校验拒绝合法填充。先检查 16/18/22/24px、1×/2×及亮暗背景，再检查真实菜单栏。视觉增量定向替代 `refine-zero-icon-family` 的 active 一条液面线条款；其他身份保持原规范。该能力尚未进入 main spec，未来 sync/archive 时先按旧图标能力依赖顺序同步，再以本变更的 Awake 状态条款为最终行为。

### 3. Awake 专属菜单依赖稳定工具 ID 和实时会话

仅命中 `zero.awake` 的右键菜单增加以下内容，沿用宿主组合单元点击／局部高亮与 tooltip adapter：

```text
无期限
5 分钟
10 分钟
15 分钟
30 分钟
1 小时
2 小时
5 小时
──────────────
退出 Awake
──────────────
退出 Zero 状态栏
```

名称根据 Zero 已解析的语言偏好生成，而非忽略应用偏好只取系统语言。菜单打开时读取当前 Rust snapshot，运行状态只勾选当前生效时长；未运行时无运行勾选。点击时长立即以该时长开启，运行中则从点击时间替换会话。左键继续现有快速切换语义：关闭当前会话，或以原有默认无期限开启。

使用 typed 菜单动作区分 `EnableDuration(Option<u64>)`、`ExitAwake` 和现有 `QuitZero`；ID 解析必须限定所属 item 和白名单时长，过期菜单点击还要验证插件可用性。菜单动作复用 Tauri 2 的 Menu/CheckMenuItem 与现有依赖，不移植 Objective-C menu controller。

**取舍：** 用户指定的时长作为一级菜单一次可达；增加二级子菜单会多一次导航。八个预设沿用现有契约，不增加自定义时长。Windows 的共享面板／fallback 保持兼容，不要求不存在的多原生图标，也不把 Awake 菜单加到 Ø 或其他工具菜单。

### 4. 所有会话变更通过同一原生协调入口

提取共享的原生转换 helper，供 IPC、状态栏左键、右键预设、退出与到期使用；命令仍为薄层。复用 Awake lifecycle 操作锁，原生启动／停止放入 spawn_blocking，完成后统一调度／取消 expiry task、更新诊断观察、刷新状态栏并发送状态失效通知。不能从菜单直接写 snapshot 或重复生成后台 caffeinate 进程。

保持现有 IPC，无需新增开启命令：

```rust
#[tauri::command]
pub async fn toggle_keep_awake(
    app: tauri::AppHandle,
    enabled: bool,
    duration_minutes: Option<u64>,
) -> Result<CaffeineSnapshot, String>;
```

```ts
interface CaffeineSnapshot {
  enabled: boolean;
  started_at_ms: number | null;
  duration_minutes: CaffeineDurationMinutes;
  expires_at_ms: number | null;
  message: string;
  action_error: {
    action: "enable" | "disable" | "toggle" | "exit" | "expiry";
    code: "operation_failed" | "hide_failed" | "display_failed";
  } | null;
}
const next = await invoke<CaffeineSnapshot>("toggle_keep_awake", {
  enabled: true,
  durationMinutes: 10,
});
```

这里 Rust response 继续 snake_case，invoke 参数保持 Tauri 所需 `durationMinutes`；不进行全局命名转换。

增加内部 `caffeine-state-changed` 失效通知，无敏感数据载荷。可见面板接到通知后读取 `get_caffeine_state`，隐藏面板不创建重复计时或轮询，重新显示时读取权威快照。hook 管理订阅释放、请求顺序和 surface generation，旧异步响应不能覆盖更新结果；可合并连续通知，但最后一次变化必须被读取。计时继续由已确认 snapshot 计算，0 秒不乐观宣布关闭，等待原生确认。

原生菜单动作失败不能只 `let _ =` 丢弃。Rust snapshot 的 `action_error` 保留显式 TS/Rust 对称的动作类型和安全错误码，状态失效事件促使可见面板显示本地化 inline 错误；无面板可见时通过已有 rfd 宿主对话框呈现本地化失败。成功转换清除错误，core 不导入 caffeine 模块。诊断日志是补充证据。

实测暴露出一次隐藏窗口五分钟会话未停止的问题，采样未见 UI／业务锁阻塞。到期协调器补上 wall-clock deadline 与 monotonic timer 提前唤醒时的重新等待：只有当前 generation 已达到期限才停止；早醒重调度，旧 generation 结束而不操作新会话。首轮失败与修复后的实测结果分别记录，不能以模拟时钟代替最终实测。

### 5. 退出 Awake 是停止后隐藏，失败不伪装成功

用户明确要求功能同时退出，采用标签“退出 Awake”，其语义如下：

1. 在同一 Awake lifecycle 操作锁内关闭原生唤醒、清空 session 时间字段、撤销计时任务并确认停止。
2. 合并持久化 `visible_plugin_items[zero.awake] = false`，更新组合图片、命中索引、tooltip 和局部高亮状态，保留其他设置。
3. 向可见面板发送状态失效通知；Zero、其他工具、主面板入口继续可用。插件本身保持已启用，从 main 可以重新开启；状态栏入口需要从现有设置恢复。

关闭失败：不隐藏图标、不显示退出成功，读取实际状态并显示错误。关闭成功但可见性保存失败：保持已关闭、不自动恢复唤醒，保留原可见性并报告“已关闭，隐藏失败”；原生图像刷新失败也报告可恢复的降级状态。恢复图标只恢复入口，不自动开启或恢复旧倒计时。退出未运行的 Awake 也能隐藏入口。退出后重启沿用保存的隐藏设置，不新增自动恢复会话。

面板“关闭咖啡因”只停止会话，图标仍留在状态栏。设置中的普通可见性开关保持原有只控制入口的语义；“退出 Awake”才将停止和隐藏组合起来。“退出 Zero 状态栏”继续全应用退出，保持既有资源清理。

**取舍：** 只隐藏会让原生唤醒继续运行，违背用户意图；直接禁用／卸载插件则改变工具导航和安装契约。停止会话再隐藏入口能满足退出语义并保留清晰恢复路径。

## Risks / Trade-offs

- [菜单退出改变组合单元数量，旧命中／高亮失效] → 沿用稳定 item ID、布局 generation 和现有清理 adapter，测试退出、折叠、恢复与菜单关闭顺序。
- [菜单和面板并发变更，旧 expiry 误停新会话] → 同一原生操作锁、现有 generation、取消任务及权威 refresh；覆盖快速切换／退出／到期竞态。
- [停止和保存可见性不能原子提交] → 以停止为第一优先级，保存失败绝不恢复唤醒；区分完整成功与部分成功反馈。
- [英文本地化或错误内容挤出操作区] → 默认尺寸双语言截图；主动作独立底部区域，异常内容可滚动且可键盘访问。
- [实心图标变得过重或手柄负空间糊合] → 按最小 16px 光学评审，保留 Zero 外部轮廓，亮暗 Template Image 实机验收独立记录。
- [历史规范仍描述旧图标或偏好窗口] → 以当前源码和本提案为准，记录定向替代，不改写历史 evidence 或勾选其他变更的设备任务。

## Migration Plan

1. 实施前复核工作树与重叠变更，先补齐共享会话转换／状态同步，再增加菜单预设与退出流程。
2. 调整 Awake 面板与本地化，再更新图标 masters、派生资源、校验和文档；只生成本变更涉及的资产。
3. 运行自动门禁及 macOS 真机流程；Windows 单独记录设备结果，缺失证据保持未完成。
4. 无新存储格式或数据迁移。回滚可独立恢复旧面板、图标和菜单；已有隐藏设置仍由旧设置页恢复，不删除用户偏好或自动启用唤醒。
