## Context

动机与确认范围见 [proposal](proposal.md)。本设计截至 2026-10-31 是待实施方案，不是当前源码能力或设备验收记录。

当前实现有以下约束：

- `useBingWallpaper.ts` 在 Paper surface 为 active 时 cache-first 加载；`bingWallpaperModel.ts` 无条件保留仍存在的选中 ID。缓存先自动选中旧图后，即使新图返回也不会前移。
- `bingWallpaperCache.ts` 在同一中国市场日内复用最多五分钟的成功刷新；显式 retry 已能绕过复用。不能把该复用误判为多日缓存策略。
- Rust `services/bing_wallpaper/mod.rs` 拥有受限 Bing 请求、十条索引、单次刷新合并、预览 token 和经验证的系统壁纸应用；尚无 Paper 设置或每日自动任务。
- Paper 注册了专用 `paper` surface，但没有 `loadSettings`。主窗口工具设置有通用插件自有组件扩展点，Awake 已使用；Paper 不需要另造设置窗口。
- `awake_power_events.rs` 有 macOS／Windows 电源与唤醒通知，但当前由 Awake runtime 持有。Paper 不应依赖 Awake 是否启用。

### Existing OpenSpec overlap and integration precedence

| 已有变更 | 保留／细化关系 |
| --- | --- |
| [add-bing-wallpaper-plugin](../add-bing-wallpaper-plugin/specs/bing-wallpaper/spec.md) | 保留 cache-first、十条历史、真实日期、下载、原生应用和 preview 生命周期。`Selection survives refresh` 细化为保护用户主动选择，不保护本次打开时自动选中的缓存默认值；新打开会话重置 latest-following。 |
| [systematic-performance-and-code-optimization](../systematic-performance-and-code-optimization/specs/plugin-workload-efficiency/spec.md) | 保留按需 UI、隐藏展示停止、去重和有界工作。用户明确开启的原生自动任务是独立工作负载，不因导入或隐藏 UI 启动。 |
| [open-tool-surfaces-from-status-bar](../open-tool-surfaces-from-status-bar/specs/status-bar-tool-surfaces/spec.md) | 保留 Paper 点击切换、定位和失焦隐藏；隐藏后重新显示产生新的 Paper 打开展示会话，不改变窗口行为。 |
| [optimize-preferences-settings](../optimize-preferences-settings/specs/preferences-settings-center/spec.md) | 复用主窗口工具设置、即时保存、局部反馈、搜索定位和双语可访问性。 |

Paper 主规范尚未同步，故本变更新增两个补充 capability，不伪造对不存在主规范的 MODIFIED delta。本设计明确覆盖旧变更过宽的“任何选中 ID 都在刷新后保留”解释。将来经授权整合规范时，先整合 `add-bing-wallpaper-plugin` 基线，再将 `Users can browse wallpaper history with stable navigation` 完整 requirement 的四个既有 scenario 一并保留并细化 `Plugin opens with multiple entries` 和 `Selection survives refresh`，加入新的会话场景；随后整合本变更的两个补充能力。不能只同步新增文件而留下相互矛盾的选择约定。本轮不编辑、同步或归档原变更。

## Goals / Non-Goals

**Goals:**

- 让“启动／进入 Zero Paper”成为明确的用户动作边界：专用窗口 hidden→shown、工具导航从别的工具切入 Paper，以及视图首次展示。不同可见 surface 各自持有展示会话。
- 把 UI 选择意图与 Rust 权威的下载／桌面状态分开；UI 隐藏不取消明确开启的原生任务，旧 UI 请求不回写新会话。
- 以可注入时钟、fetcher、持久化和 setter 测试日界、休眠、失败及竞态；尽量复用当前依赖和适配层。

**Non-Goals:**

- 不把“启动 Paper”改成“启动 Zero 就无条件联网／应用”。仅已开启自动换图的用户会在 Zero 启动时运行后台检查。
- 不为 Paper 加入浏览器计时器驱动的后台调度或独立进程；不监视其他应用／系统设置造成的外部壁纸变化。手动保护特指通过 Paper 成功应用的选择。
- 不更换 Bing 中国区来源，不扩大壁纸平台承诺，也不增加收藏、更多源、动态渲染和每屏／Space／锁屏控制。其余产品范围见 proposal。

## Decisions

### 1. One opening session distinguishes automatic selection from user intent

前端纯 model 增加 `latestFollowing | browsingHistory` 意图，另持有单调的展示会话 generation：

1. 新打开会话进入 `latestFollowing`，从 snapshot 选择最新项；联网结果回来继续跟随最新项。
2. 用户主动历史导航进入 `browsingHistory`，刷新按 ID 保留其选择；若该 ID 被十条历史淘汰，回到最新并恢复 latest-following。
3. “回到最新”立即选择当前最新并恢复 latest-following；不自动应用桌面，也不必须先发新请求。
4. “立即刷新”绕过五分钟成功复用，但保留当前意图；网络结果按会话 generation／请求 revision 拒绝迟到回写。
5. Paper 被隐藏或离开工具时销毁该展示会话；再次显示开始新会话。普通 focus、后台状态事件、语言刷新和 rerender 不重置选择。

沿用 `PresentationActivity`／surface activity 的通用状态，在必要处补充“进入”revision；不从窗口焦点事件直接推导新会话。托盘／主窗口中的工具切换与专用窗口显示都要覆盖，不能仅修首次 React mount。显示前先处理新会话状态，避免上一会话迟到结果短暂写入。用户在缓存显示后、远端完成前主动导航的操作必须保留。

**Alternatives:** 无条件每次 refresh 跳到最新会打断浏览；只在首次 mount 默认最新不能修复持久 WebView 重开；单靠 selectedId 无法区分缓存默认和主动选择。显式意图状态最小且可测试。

### 2. Native Paper automation owns scheduling and system side effects

在 `services/bing_wallpaper/` 下按职责添加 settings store、policy、runtime 模块，复用现有 refresh／ensure_cached／setter。`commands/` 只校验调用者、接收 typed input 和委托服务。`bundled_plugins.rs` 负责启动与插件 enablement 协调；退出路径停止订阅／调度。`src/core/` 不导入 Paper 实现。

自动 runtime 是 Zero 进程内的一个有界异步任务，仅在设置开启、Paper 插件启用、平台可应用且安全状态有效时工作。展示事件、手动刷新、native startup／timer／resume 全部合并到同一 refresh 流水线。preview decode 仍仅由可见需求启动。

隐藏导航或状态栏图标不改变 enablement；禁用插件保留设置但停止任务；重新启用后只启动一个 runtime，并沿用去重和当日保护。自动开关 off→on 属于新的立即应用请求，清除当日手动保护；插件 disable→enable 不清除保护。

**Alternatives:** React interval 在隐藏／休眠／窗口销毁后不可靠；单独 daemon 会扩大安装与卸载范围；宿主全局设置硬编码 Paper 会破坏插件边界。

### 3. Fixed China-market day, bounded reconciliation, and shared resume observation

日策略固定 `zh-CN` 的 UTC+08:00 市场日，复用现有 `displayDate` 的日期语义，缺失时以有效 `startDate` 降级。不跟随 UI 英文或机器本地时区切换，不把系统日期写成图片日期。

建议的实施参数由工程设计选定，并非新增用户配置：

- off→on、启用状态下的 Zero 启动、中国市场跨日、resume 各触发一次合并检查；不阻塞 Zero 窗口启动。
- 原生 reconciliation 至多每 60 秒醒来一次，仅计算是否到期；正常检查成功后至多每 6 小时检查一次，市场午夜或 resume 可提前触发。
- 网络／下载等可恢复错误按 1、5、15、30 分钟退避，之后上限 30 分钟；当天尚未发布按 30 分钟再检查；持续失败不忙循环。
- 重复 resume 事件合并，成功检查后的自动事件 60 秒冷却；跨日和显式 Refresh now 不因冷却丢失。冷却期间登记一个 due check，不开启并行网络链。
- 退避用 monotonic elapsed 控制间隔；每次重新对照 UTC wall clock 计算市场日和下一午夜。时钟跳跃后只补最新一次，不补跑所有错过的 interval。
- 原生 resume 信号不可用时，60 秒 reconciliation 发现执行间隔／市场日变化后补检查；不能把“唤醒通知已注册”当设备验收。

将 `awake_power_events.rs` 中通用平台通知抽成宿主级、可共享、按消费者持有订阅的轻量服务，供 Awake 与 Paper 分别消费 revision／通知。保留 Awake 电源策略行为和 feature profile，不让 Paper 引入 Awake 插件业务。通知失败降级到 reconciliation；两个消费者都停用时释放 observer。Windows、macOS 的取消与退出清理分别测试。

**Alternatives:** 每分钟联网不必要；只在午夜执行会漏掉晚发布或休眠；Paper 直接调用 Awake runtime 会产生插件耦合。抽取已有平台适配不需要增加第三方依赖。

### 4. Persist settings, most recent application, and manual safety state

在现有 Paper root `~/.zero/data/wallpaper/` 内保存独立版本化 `paper-state.json`，通过现有受控 JSON／原子写基础设施读写，避免改动图片 index schema。文件包含 `schemaVersion`、设置和必要调度安全状态：

- `autoChangeDaily: false` 为缺文件时的默认值。
- 最近一次成功的 Paper 应用 `{wallpaperId, publicationDate, appliedAt, origin}`；记录所有 Paper 成功应用（手动／自动），去重比较**最近一次**成功应用，不能用“曾经用过的所有图片”永久禁止再次应用。
- `manualOverrideUntil` 为成功手动应用历史图当天之后的下一个中国午夜，跨重启生效；历史图指发布日期早于当前中国市场日，或早于当前最新可用条目的图片。仅浏览、下载或失败的手动应用不创建保护。
- 已准备但未确认完成的 apply intent，以及设置／安全状态可用性。检查时间可保存，但调度 due time 在重启时重新推导，不能直接信任持久化 timer。

缺文件可安全迁移；损坏、未知版本或不可读文件保留并报错，阻止自动应用，不悄悄覆盖。原 `index.json`、旧 `.ztool` 迁移输入和未知用户文件均保留。插件隐藏不删除数据。

所有 Paper 手动／自动应用共享一条 async application queue。锁只串行化流程，OS 阻塞调用仍在 worker 上，不能持有全局 std mutex 执行文件／系统 API。手动请求登记后推进 automation generation，已排队自动操作必须在系统调用前重新检查设置、enablement、generation 和 manual intent。

在不可逆 OS 应用前原子写入 pending intent；OS 返回后保存真实成功／失败及保护状态。若中间崩溃或结果无法持久化，下一次启动发现 unresolved intent 时阻止自动应用并明确报告，避免假装具备 exactly-once。存储恢复后可通过明确的 off→on 请求重建自动状态；不得自动清除不确定状态并继续覆盖用户桌面。系统调用已开始后关闭开关无法撤销该调用，只禁止后续动作并报告真实结果。

**Alternatives:** localStorage 无法可靠协调后台和多个 WebView；只保存日期不能区分图片与手动覆盖；OS 成功后才首次写日志存在崩溃后重复应用窗口。持久化 intent 不能让 OS 和磁盘事务原子化，但可以安全地暴露不确定性。

### 5. Eligibility separates explicit enabling from normal daily checks

| 情况 | 行为 |
| --- | --- |
| 自动关闭，打开 Paper／刷新／回到最新 | 只更新数据和预览，不改变桌面 |
| off→on 保存成功 | 立即检查并尝试最新可用图，允许早于今天；最新 ID 与最近成功应用相同则跳过系统调用 |
| 普通 daily check 只有昨天或更早图 | 保留桌面，显示尚无当天图，30 分钟后重试 |
| 普通 check 得到当天最新有效图 | 无 manual override 且 ID 不等于最近成功应用时应用一次 |
| 用户在 Paper 成功手动应用历史图 | 保护至下一个中国午夜；即使检查到今日图也不覆盖 |
| 用户成功手动应用当前最新图 | 更新最近应用记录，避免随后自动重复设置 |
| 次日保护过期但新图仍未发布 | 保留桌面，等待当前市场日的新图 |
| 下载、校验或 setter 失败 | 保留旧桌面，不写成功记录；仅 retryable 错误进入退避 |
| 平台 unsupported／设置或安全状态不可用 | 不重复调用系统 API，展示原因，浏览／下载能力尽量保持可用 |

排序继续使用现有有效源日期与稳定 ID；发布日判断复用中国市场展示日期，不由显示字符串随意解析。未来日期／不合法日期不得作为“今天”的自动候选。metadata 成功不代表缺失原图下载成功；只对经验证的原图调用现有 setter。

本轮不检测 Zero 之外的手动桌面变化，因此不能承诺保护外部选择。现有系统后端控制哪些显示器仍由该适配器决定，不宣传逐屏设置。

### 6. Typed IPC and revisioned authoritative status

现有 Bing 类型的 camelCase wire format 保留。以下是拟新增边界；定义位置分别为 Paper 原生服务与 `src/plugins/bingWallpaper/contracts.ts`，可按模块拆分但字段必须一致。可选字段使用 serde `skip_serializing_if`，对应 TS 可选字段；时间均为 UTC RFC 3339，publication date 为 `YYYY-MM-DD`。

```rust
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperSettings {
    pub version: u8,
    pub auto_change_daily: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperSettingsUpdate {
    pub auto_change_daily: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PaperAutomationPhase {
    Off, Idle, Checking, Applying, PausedForManual,
    RetryWaiting, Unsupported, Error,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperRuntimeSnapshot {
    pub revision: u32,
    pub phase: PaperAutomationPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_successful_refresh_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_available_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_wallpaper_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_applied_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual_override_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_check_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BingWallpaperError>,
}

#[tauri::command]
pub async fn get_paper_settings(
    app: tauri::AppHandle,
) -> Result<PaperSettings, BingWallpaperError>;

#[tauri::command]
pub async fn update_paper_settings(
    input: PaperSettingsUpdate, app: tauri::AppHandle,
) -> Result<PaperSettings, BingWallpaperError>;

#[tauri::command]
pub async fn get_paper_runtime_snapshot(
    app: tauri::AppHandle,
) -> Result<PaperRuntimeSnapshot, BingWallpaperError>;

#[tauri::command]
pub async fn check_paper_wallpaper_updates(
    app: tauri::AppHandle,
) -> Result<PaperRuntimeSnapshot, BingWallpaperError>;
```

```ts
export interface PaperSettings { version: number; autoChangeDaily: boolean }
export interface PaperSettingsUpdate { autoChangeDaily: boolean }
export type PaperAutomationPhase =
  | "off" | "idle" | "checking" | "applying" | "pausedForManual"
  | "retryWaiting" | "unsupported" | "error";
export interface PaperRuntimeSnapshot {
  revision: number;
  phase: PaperAutomationPhase;
  lastCheckedAt?: string;
  lastSuccessfulRefreshAt?: string;
  latestAvailableDate?: string;
  lastAppliedWallpaperId?: string;
  lastAppliedDate?: string;
  lastAppliedAt?: string;
  manualOverrideUntil?: string;
  nextCheckAt?: string;
  error?: BingWallpaperError;
}
export const paperSettingsService = {
  read: () => invoke<PaperSettings>("get_paper_settings"),
  update: (input: PaperSettingsUpdate) =>
    invoke<PaperSettings>("update_paper_settings", { input }),
  status: () => invoke<PaperRuntimeSnapshot>("get_paper_runtime_snapshot"),
  check: () => invoke<PaperRuntimeSnapshot>("check_paper_wallpaper_updates"),
};
```

`update` 只在持久化完成后确认设置；立即应用在后台推进，失败通过 runtime error 呈现，不把保存成功误回滚成设置未保存。`check` 强制实际 refresh／合并进行中的请求，返回包含网络／应用错误的状态；命令本身的拒绝或无法获取状态用 `Result::Err`。完成后重新读取已有 wallpaper snapshot，以同一服务状态展示元数据。

普通激活刷新也更新 native 最近检查／成功时间；重放五分钟缓存不更新 `lastCheckedAt`。`lastCheckedAt` 是本轮实际网络检查完成时间，无论成功失败；`lastSuccessfulRefreshAt` 只在 metadata 成功时推进。runtime 通过 `zero://paper-status-changed` 发布小型权威状态，前端只接受当前 process 内更新的 revision；监听先建立再读 snapshot，事件合并后按需读图库 snapshot。隐藏时可停用 UI 监听，恢复时重读；不用 WebView 保活维持权威任务。

读取与更新使用已有调用者限制策略，仅授权相应宿主窗口；第三方 WebView 和 File engine 不获得新增命令权限。拒绝 `any`、任意路径和任意图片 URL 输入。保留旧 preview token／raw bytes 的释放流程。

### 7. Small UI additions use the existing plugin settings extension

- Paper `loadSettings` 懒加载自有组件，在主窗口 Paper 详情中放置立即保存的“每日自动更换壁纸”开关和一句“仅在 Zero 运行时更新”的说明，链接到已有全局开机启动设置。
- 纳入现有设置搜索描述／定位锚点；禁用或 unsupported 时展示原因，已保存的开启偏好不能被误显示为正在工作；关闭开关仍应可操作。
- Quick surface 增加有 accessible name 的“回到最新”和“立即刷新”，保留现有下载／应用／历史箭头；最新时回到最新可禁用，刷新中仅防重复点击。
- 日期旁放简短刷新／旧缓存提示，错误近控件可重试；主窗口设置展开最近检查、最近成功应用、下一次检查或当天手动暂停原因，避免把所有字段塞进托盘。
- “今日尚未有新图”依据成功检查与真实日期，不假定 Bing 保证午夜准时发布；错误不通过定时弹窗或系统通知打扰。

### 8. Prior art informs behavior without adding dependencies

调研来自官方页面／项目 README，未安装或实机测试这些应用：

| 参考 | 借鉴／取舍 |
| --- | --- |
| [Bing Wallpaper](https://bingapps.microsoft.com/apps/wallpaper) | 每日图片和来源故事；复用现有版权信息，不增加商城或 AI 生图。 |
| [DailyWalls](https://github.com/Xiaohan-Tian/DailyWalls) | 启动／唤醒检查、按日去重、缓存和立即刷新；最接近本次稳定性问题。 |
| [Daily-Pic](https://github.com/KuramaSyu/Daily-Pic) | 最新导航和图片信息；收藏另有存储与产品语义，后置。 |
| [WinDynamicDesktop](https://github.com/t1m0thyj/WinDynamicDesktop) | 日夜主题涉及时间阶段与素材体系，后置。 |
| [Plash](https://sindresorhus.com/plash) / [Lively](https://github.com/lively-community/lively) | 借鉴后台工作节制原则；网页／视频渲染与多屏控制后置。 |

不复制这些项目代码，也不以小型示例项目充当高星成熟依赖。当前已具备 `reqwest`、异步运行时和 `wallpaper` 系统适配器，无需为每日调度新增外部库。`wallpaper` 的维护与平台限制继续由适配层和设备验证承担。

## Risks / Trade-offs

- [Bing 数据与实际发布日期可能滞后] → 只展示真实日期；每日普通应用等待当前市场日新图，明确开启时允许最新可用旧图；有限频率再检查。
- [OS 设置与磁盘提交不能组成同一事务] → durable pending intent；未解决 intent 或持久化故障阻止自动应用；分别报告桌面实际结果与保存失败。
- [手动与自动并发覆盖] → 共享应用队列、手动意图 revision、每次 OS 调用前复核，测试已准备自动图与手动请求竞态。
- [抽取 power observer 影响 Awake] → 仅移动通用通知能力，保持 Awake 消费策略、取消和条件编译；增加其现有电源事件回归任务。
- [自动后台请求增加网络活动] → 默认关闭；不运行隐藏 preview，单 flight、退避、去重和按插件启停；不把隐身 UI 误当开启授权。
- [原图清理误删系统仍依赖的文件] → 实施时核查 setter 的文件引用语义；当前已应用文件必须保持有效，必要时保留一个受控 applied 副本且只在替换成功后清理先前自有副本，不扩大图库十条上限或清理未知文件。
- [多窗口本地缓存延迟显示 native 新状态] → revisioned 事件使活动 UI 失效并重读；回显快照不伪装成网络新检查；新会话／旧请求 gate 分开。
- [支持范围容易被编译结果夸大] → macOS／Windows 设备验收单列，Linux 保留现有 capability 降级，不新增 mobile 或逐屏承诺。

## Migration Plan

1. 先补纯选择与调度 policy 及 fake clock／fetcher／setter／store 测试，再接入已有服务；不使用真实用户壁纸做单元测试。
2. 加入版本化独立状态文件，缺省关闭；兼容旧 image index，未知版本不覆盖。先把手动应用纳入同一 native 编排，再开放自动开关，避免同时存在两条 setter 路径。
3. 接入 shared power observation、startup／enablement／exit、typed commands、事件和 `loadSettings`；full／standard 包含 Paper，core 不能带入新任务或 Paper UI。
4. 补开窗／切工具的展示会话与多 surface 同步，完成精简 UI 和双语设置搜索定位。
5. 执行相关自动检查和原生设备矩阵。文档记录源实现、自动化检查、macOS 实机、Windows 实机的独立状态，不以任务勾选代替证据。
6. 经维护者另行授权后再实施规范整合顺序；本轮不 sync／archive、不提交／推送。

回滚：关闭自动开关或禁用 Paper 后停止任务；回退到旧版本时保留新增状态文件与旧缓存，旧代码可忽略它，不恢复或删除用户当前桌面。新实现也不承诺恢复此前系统壁纸。全局开机启动配置和 bundle identifier 保持原值。
