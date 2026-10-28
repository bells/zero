## Context

动机与产品范围见 [proposal.md](proposal.md)。本设计记录自定义时间和电池保护的已确认决策，以及将策略配置放进偏好设置的最终修正；尚未修改产品源码或完成设备验收。

- `CaffeineSession`、Rust expiry task 和 generation 目前以 `SystemTime` 管理所有有限会话；TS 使用七个预设的 literal union，面板对未知时长还会回退显示无期限。仅放宽输入校验会出现错误显示和调钟语义不符。
- 面板／原生菜单已共用 `caffeine_runtime`、lifecycle 锁、失效事件和权威 snapshot。新能力必须沿用这些协调边界。
- macOS 管理 `caffeinate -d -i`，Windows 调用 `SetThreadExecutionState`；保留现有支持范围，不把系统正常休眠规则等同于立即睡眠。
- `refine-awake-controls-and-status-menu` 是重叠的已实施未归档变更。本次仅扩展其计时、菜单和输入行为，不清理它的未完设备任务。
- 偏好中心已动态生成 `tool:zero.awake` 页面，但当前只有通用工具控制，`BundledPluginModule` 没有 settings loader。应复用已有工具偏好导航并增加抽象插槽，不能让 core 为 Awake 写特例导入。

## Goals / Non-Goals

**Goals:** 单一原生会话同时支持无期限、持续时长和绝对截止时刻；两个界面复用状态和规则；输入无副作用，确认后原子替换；电池策略在偏好页配置，后台保护不依赖窗口可见；隐藏、退出和旧 timer 行为可靠。

**Non-Goals:** 合盖运行、强制休眠、自动触发／恢复、快速延长、其他插件改造；整体视觉重做或增加独立 Awake 窗口；直接复制参考项目代码。电池保护不修改系统低电量模式或系统电源设置，只读取状态并管理 Zero 自有的防休眠请求。

## Decisions

### 1. Approaches：统一自定义入口，保留两种用户意图

比较过只加任意时长、只加 Until，以及统一入口提供两种模式。用户选择第三种：固定预设仍一步可达，“自定义…”内提供“持续多久／直到某时”。相对时长与绝对时刻不在原生层提前合并成同一种 timer，避免调钟后含义丢失。

持续时长用小时＋分钟输入，小时 0–24、分钟 0–59，总计只能为 1–1440 的整数；24 小时仅允许搭配 0 分钟。Until 仅选时分，按本地日历解析下一个严格晚于当前时刻的目标，预览今天／明天、结束钟点与剩余时间；不提供日期选择器。

工程规则：夏令时使用本地日历规则，不用“今天的 epoch＋固定 24 小时”推明天；重复钟点取下一次有效出现，不存在的钟点向后解析到有效时刻并展示实际结果。实现前核对已有依赖，优先标准／平台能力；若需日期库，应选维护活跃的现有方案并核对许可证。不同平台时区解析须有可控时钟／时区用例。

### 2. 明确的 IPC 与兼容入口

保留 `toggle_keep_awake(enabled, duration_minutes)` 的既有预设校验和关闭语义，原生左键启用仍为无期限；新增插件调用命令接收显式 schedule，全部进入同一协调器。以下为拟定契约，字段与 `serde` 必须逐项相同：

```rust
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CaffeineSchedule {
    Unlimited,
    Duration { minutes: u64 },
    Until { expires_at_ms: u64 },
}

#[tauri::command]
pub async fn set_caffeine_schedule(
    app: tauri::AppHandle,
    schedule: CaffeineSchedule,
) -> Result<CaffeineSnapshot, String>;
```

```ts
interface CaffeineUnlimitedSchedule { kind: "unlimited" }
interface CaffeineDurationSchedule { kind: "duration"; minutes: number }
interface CaffeineUntilSchedule { kind: "until"; expires_at_ms: number }
type CaffeineSchedule =
  | CaffeineUnlimitedSchedule
  | CaffeineDurationSchedule
  | CaffeineUntilSchedule;

interface SetCaffeineScheduleInput { schedule: CaffeineSchedule }

const input: SetCaffeineScheduleInput = {
  schedule: { kind: "duration", minutes: 45 },
};
const snapshot = await invoke<CaffeineSnapshot>("set_caffeine_schedule", {
  ...input,
});
```

Rust 是参数与运行状态的权威：拒绝无效整数、0、超过 1440 分钟、过去或溢出的 epoch。Until 的安全上界按下一本地日历日并预留夏令时差异确定，不能将“下一天”硬编码成 1440 分钟。前端仅发送预览中的绝对时刻；确认时如果预览已经过期，刷新预览并要求再次确认，不能悄悄改为明天并启动。

`CaffeineSnapshot` 保留既有 snake_case 字段，增加 `schedule: CaffeineSchedule | null`、`elapsed_ms: number | null`、`remaining_ms: number | null`。运行无期限的 schedule 是 unlimited，非运行时为 null；duration_minutes 在 duration 模式为任意合法整数、until 模式为 null，不能再通过 null 判断是否无期限。`expires_at_ms` 在 until 模式为固定目标，在 duration 模式为观测时的预计结束时刻；相对模式剩余时间以 remaining_ms 为准，所有运行模式的已运行时间以 elapsed_ms 为准，避免调钟时显示跳变。同步更新 Rust struct／TS interface、调用者校验和必要权限／注册。

### 3. 双时钟、单一会话和可靠替换

duration 保存总时长及不受系统调钟影响的 elapsed 来源；until 保存固定 UTC epoch，时区只用于显示。expiry 检查由 Rust 完成，前端仅展示；until 不能只 sleep 最初算出的差值，否则调钟前进后可能迟迟不结束。采用原生时间变化通知或最长 1 秒重新核对的原生等待，关闭时撤销，不新增隐藏前端轮询。

持续时长的原生计时来源须验证 macOS／Windows 的休眠恢复语义：休眠期间也计入实际经过时间，恢复后立即核对已到期会话。不能假定 Rust `Instant` 或 Tokio timer 在所有平台都包含 suspend；以可注入的 clock adapter 隔离平台差异，并记录设备证据。前端对所有模式的 elapsed_ms 及 duration 的 remaining_ms 使用单调展示时钟估算；until 的剩余显示使用固定 expires_at_ms 与当前墙钟之差，使调钟后显示符合截止时刻。重新显示及系统恢复后读取权威 snapshot，Date.now 的跳变不能改变相对时长或已运行时间，前端也不能自行宣布会话已关闭。

参数校验及会话替换在统一 lifecycle 边界完成。运行中确认新值从确认成功时重新计时；generation、取消旧任务、原生开启／停止、失效事件和图标刷新仍共用协调器。非法输入或原生操作失败不覆盖当前有效会话；到期仅撤销本应用防休眠请求，不启动自动规则。

### 4. 输入草稿、展示和原生菜单导航

保持现有 main 圆盘／完整工作区及托盘紧凑信息行。预设区增加“自定义…”入口，展开有标签的模式选择、输入、预览、确认和取消。未运行显示“开始”，运行中显示“应用”；所有编辑均不触发原生会话变更。预设保持现有语义：未运行先选后开启，运行中立即替换。

自定义 duration 的当前值按实际时长显示，until 显示“直到 今天／明天 HH:mm”；跨时区或系统日期变化后，按固定目标重新格式化实际日期，不能持续显示旧的“今天”。剩余只显示一次。自定义值不勾选无期限或错误预设，不能沿用当前未知值回退无限的逻辑。已到零先显示“正在结束”，直至 Rust 确认关闭。

Awake 原生菜单新增 typed 自定义动作，经已有主窗口导航打开 Awake 并要求展开编辑器；不启用会话。使用保留到消费的导航 intent／revision（可重复点击、页面尚未挂载也不丢失），core 只传宿主支持的目标与上下文，不能导入插件。面板已有未提交草稿时保留草稿和焦点，不能因菜单导航重置正在输入的内容。

支持中英文、键盘、可见焦点、错误反馈和至少 44px 的主要动作；托盘展开后的可滚动输入不得遮住取消／确认；主窗口圆盘不增加重复计时。沿用 busy guard 和 aria-disabled，避免重新引入原生 disabled 引起的焦点问题。

### 5. 持久化确认的输入与保护策略，不恢复会话

偏好保存版本号、最近模式、持续分钟数、until 的 hour/minute，不保存 expires_at_ms、会话 enabled 或启动时刻。只有成功应用后的输入才成为“上次输入”；取消和无效输入不覆盖。重新打开 until 按保存的钟点生成新的预览，必须确认才启动。首次默认 duration 为 1 小时，until 为接下来整分钟起算的约 1 小时后；这是工程默认值，不是用户指定值。

优先复用已有插件偏好／Rust 本地受控存储，不用多个 WebView 各自的临时状态作为持久化真源。读取失败使用默认草稿并给可见错误；写入失败保留实际运行会话并报告“已应用，记住输入失败”，不谎报已保存，也不重启计时。为此增加 Rust／TS 对称的非致命偏好保存错误码，不能将已启动成功误映射成开启失败。偏好更改不得覆盖其他插件或 `zero.preferences.v1` 的数据。

保护策略单独保存两个开关和 threshold_percent，缺省开关均 false，阈值默认 10。保护设置与自定义输入采用同一原生版本化偏好真源、字段合并与串行更新，修改保护不得覆盖最近输入，记住输入也不得覆盖保护设置。保护设置成功保存才提交生效；保存失败仍保留上一策略并呈现错误，不将未保存的草稿作用于会话。

“偏好不存在”才使用默认策略；“偏好读取失败／内容损坏”须报告错误，不能把原来可能启用的保护伪装成已关闭。运行中保留最后一次已知有效策略，首次读取失败则明确标为策略暂不可用并允许重试，不持久化错误回退值。

### 6. 电池策略只放在偏好设置的 Awake 页

用户最终选择“偏好设置 → Zero Awake”，替代先前在 Awake 主页面添加折叠电池区的建议。复用 `tool:zero.awake` 页面，在现有通用工具控制之后添加“电池保护”设置段，沿用设置行、开关、保存反馈和键盘语义。

- 第一行“电量较低时停止 Awake”，独立开关默认关闭；开启后可调整 10%–90%、5% 步进的阈值，旁边显式显示百分比，支持键盘，不仅靠滑条位置表达数值。
- 第二行“低电量模式下停止 Awake”，独立开关默认关闭。简短说明两种保护仅在电池供电时生效，接电不触发。
- 说明手动低电量会话例外仅对电量阈值有效；低电量模式不能绕过；停止后不自动恢复。无电池／不支持时解释不可用原因，未知状态和读取失败不能伪装成关闭或正常。
- main／tray 保留本次时长、开始／停止、状态，以及触发后的一行停止原因；运行中的阈值例外有一行明确提示，不增加策略开关、阈值滑条或另一个电池仪表盘。

为内置模块加入可选 `loadSettings` 与本地化设置搜索索引描述。Awake 自有组件、hook、domain 和文案放在 `src/plugins/caffeine/`。appShell 根据当前插件懒加载 settings renderer，通过通用插槽传入偏好中心／工具页，替换该页“没有其他设置”的占位；core 只接收抽象契约和 renderer，不导入具体插件或 appShell。新增搜索词覆盖电池、电量、低电量及英文对应词，并能聚焦到实际设置行；core／standard／full profile 必须按构建所含模块工作。

### 7. 原生电源状态、例外与停止协调

电池保护使用 Rust 持有的原生状态与平台 adapter，不能依赖 React timer 或偏好页常驻。macOS 计划使用系统电源来源／电池信息及低电量模式通知；Windows 核对系统电源 API 的电池来源和节能状态含义后实现。能力逐项返回 supported／unsupported，无电池与临时 unknown 分开；不能把不支持映射成 low_power_mode=false 或 battery_percent=0。

Rust／TS 显式定义 `AwakeBatteryPolicy { stop_on_low_battery: bool, threshold_percent: u8, stop_on_low_power_mode: bool }` 及对称 TS interface，原生校验阈值范围和 5 的步进。增加 typed 的策略读取／更新命令，以及电源能力与状态读取契约；跨边界全部匹配 snake_case。电源来源使用 `battery | external | unknown`，battery_percent 和 low_power_mode 使用可空值表达未知，另以枚举区分无电池、不支持、暂时读取错误。

策略更新的拟定 IPC 如下；保存成功后的原生停止错误通过返回的权威 session 表达，不能把“策略已保存但停止失败”伪装为“未保存”：

```rust
#[derive(serde::Deserialize, serde::Serialize)]
pub struct AwakeBatteryPolicy {
    pub stop_on_low_battery: bool,
    pub threshold_percent: u8,
    pub stop_on_low_power_mode: bool,
}

#[derive(serde::Serialize)]
pub struct AwakeBatteryPolicyUpdate {
    pub policy: AwakeBatteryPolicy,
    pub session: CaffeineSnapshot,
}

#[tauri::command]
pub async fn update_awake_battery_policy(
    app: tauri::AppHandle,
    policy: AwakeBatteryPolicy,
) -> Result<AwakeBatteryPolicyUpdate, String>;
```

```ts
interface AwakeBatteryPolicy {
  stop_on_low_battery: boolean;
  threshold_percent: number;
  stop_on_low_power_mode: boolean;
}
interface AwakeBatteryPolicyUpdate {
  policy: AwakeBatteryPolicy;
  session: CaffeineSnapshot;
}
const result = await invoke<AwakeBatteryPolicyUpdate>(
  "update_awake_battery_policy",
  { policy },
);
```

原生快照还须包含会话级 `battery_threshold_overridden`、保护可用性和 `last_stop_reason`；至少区分 `expired | low_battery | low_power_mode | null`。非运行会话仍保留最后保护停止原因，直至成功开启新会话、明确手动停止／退出或 Zero 重启；接电／电量回升不清掉原因，也不恢复计时。停止失败只记录失败，不能先写“已因低电量停止”。

规则依次处理：

1. 开始／替换请求先校验时间与策略，并获取有界等待的当前电源状态。确定外接电源时两项保护均不适用；没有内置电池时保护休眠但偏好保留。
2. 电池供电且已启用低电量模式保护、当前模式已开启时，拒绝新会话并解释原因。不能只注册变化通知而漏掉启动前已开启的模式。
3. 用户显式开启／确认替换／选择预设／左键开启属于手动请求。保护适用且阈值开关开启、当前电量 <= 阈值时，本次新会话取得阈值例外；只在成功启动时提交标记。策略修改、电源事件、读取恢复均不得生成例外。例外只豁免阈值，不豁免低电量模式，并在本次会话结束时清除。
4. 电量、电源来源、低电量模式变化及系统恢复时立即重新评估；所有 Awake 窗口隐藏仍有效。拔电后立即检查，若会话原本在外电源开启，不能因拔电时已经低电量而新授予例外。
5. 保护配置保存成功后立即评估当前会话：保留已有阈值例外，不生成新例外；只有命中已开启规则才停止，调低阈值或关闭规则本身不停止。策略禁用不会自动开启已经结束的会话。
6. 保护命中通过现有 lifecycle／generation 协调停止并取消旧 timer；同时到期则优先记录已到期，否则低电量模式原因优先于电量阈值。后续其他事件不得覆盖已结束会话的原因或重启旧任务。

工程落地规则：unknown 不是拒绝／停止条件。临时读取失败不擅自停止现有会话；新启动若也无法取得有效数据，应明确呈现“保护暂不可用”而非承诺已受保护，随后重试，恢复读取后重新评估（不能追授低电量例外）。启动前新状态读取必须有超时，重试采用有界退避；原生通知优先，在运行且开启保护时提供不超过 30 秒的校正读取。所有保护关闭／无会话时不保留无用后台轮询，偏好页按需读取当前能力和状态；plugin disable／退出／应用退出撤销监听、任务和会话例外。

### 8. 参考证据与明确差异

KeepingYouAwake 固定参考提交 [`2be93dd7f390b23fbca934ff3b1ac03468a80077`](https://github.com/newmarcel/KeepingYouAwake/tree/2be93dd7f390b23fbca934ff3b1ac03468a80077)。核对了 [会话与保护分支](https://github.com/newmarcel/KeepingYouAwake/blob/2be93dd7f390b23fbca934ff3b1ac03468a80077/KeepingYouAwake/KYAAppController/KYAAppController.m)、电池／低电量模式 monitor 及设置 XIB，未运行参考应用。

其阈值实际判断为 <=，默认 10%，UI 为 10% 步进；低电量会话标记会豁免本次阈值检查。低电量模式变化分支不检查该例外，但源码并未在新启动时立即拒绝既有低电量模式；当前核对分支也未发现截图所述的显式接电豁免，设置变更则会直接结束运行会话。

Zero 的 5% 步进、两项都只在电池供电时生效、启动前低电量模式检查、修改后按新规则决定是否停止，均是本轮已确认的产品选择。只学习交互思想，系统调用独立按 Zero 平台 adapter 实现，不将截图、源码检查或文档视为设备验收。

## Risks / Trade-offs

- [系统调钟、DST 或 suspend 改变计时表现] → 双时钟 adapter、确认时固定目标、原生有界复查，以及 macOS／Windows 分开的设备验收。
- [旧响应／timer 覆盖新任务] → 沿用 generation、lifecycle 锁和 snapshot reader 失效机制，覆盖快速替换和迟到事件。
- [Until 被误判为无限、自定义被误勾为预设] → 以 schedule.kind 判断模式，测试空闲／无限／预设／任意时长／until 全部快照。
- [输入确认或导航悄悄改变会话] → 草稿与运行状态隔离；导航 intent 必须被消费且不能自动启动。
- [Windows API 依赖调用线程] → 修改原生调度时核对 `SetThreadExecutionState` 的线程归属和清理路径，不能用 macOS 结果替代 Windows 设备结论。
- [电源数据未知时仍显示保护有效] → 显式能力／unknown 状态、有限超时和重试，界面提示暂不可用，恢复后不追授例外。
- [设置改变、插拔电源和到期竞态] → 统一生命周期锁和会话 generation，策略保存后评估，不自动恢复，不重复发布停止。
- [偏好页扩展破坏插件边界／裁剪构建] → 可选内置 settings loader，经组合层注入；core 不导入实现，第三方 runtime 不因此获得可信 renderer。
- [文档批准被等同于实施或验收] → tasks 初始全部未完成，严格区分规范校验、自动检查与真实设备结果。

## Migration Plan

1. 在本变更内增加 domain、契约和回归，再接通原生时钟与会话协调、菜单导航和输入／策略偏好。
2. 实现原生电源 adapter、会话保护与停止原因，再接入 Awake 自有偏好组件及抽象 settings 插槽。
3. 接通共享前端编辑器与双语状态反馈，保留既有预设、左键和退出 Awake 语义，不向主界面增加策略配置。
4. 运行项目规定的前端／Rust／构建预算／OpenSpec 门禁，再分别记录 macOS 和 Windows 电池与计时验收；缺少设备保持未完成。
5. 无运行会话迁移。回滚时忽略新增输入／保护偏好，恢复旧命令／面板；不删除用户数据，不自动恢复任何会话。
