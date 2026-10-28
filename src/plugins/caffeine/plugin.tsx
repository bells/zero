import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";

export const caffeinePlugin: BundledPluginModule = {
  kind: "caffeine",
  navigationIcon: "caffeine-empty",
  accentClass: "accent-caffeine",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: {
    "zh-CN": {
      title: "Zero Awake",
      subtitle: "保持屏幕与系统唤醒",
    },
    "en-US": {
      title: "Zero Awake",
      subtitle: "Keep display and system awake",
    },
  },
  loadSettings: () => import("./AwakeSettings").then(({AwakeSettings})=>({default:AwakeSettings})),
  settingsSearch: {
    "zh-CN":[
      {id:"tool.zero.awake.battery.threshold",destinationId:"tool:zero.awake",title:"电量较低时停止 Awake",description:"电池保护阈值",path:"Zero Awake",keywords:["电池","电量","阈值","battery"],focusTargetId:"preference-setting-tool-zero-awake-battery-threshold"},
      {id:"tool.zero.awake.battery.low-power",destinationId:"tool:zero.awake",title:"低电量模式下停止 Awake",description:"电池供电时生效",path:"Zero Awake",keywords:["低电量","节能","low power mode"],focusTargetId:"preference-setting-tool-zero-awake-battery-low-power"},
    ],
    "en-US":[
      {id:"tool.zero.awake.battery.threshold",destinationId:"tool:zero.awake",title:"Stop Awake when battery is low",description:"Battery protection threshold",path:"Zero Awake",keywords:["battery","charge","电池","电量"],focusTargetId:"preference-setting-tool-zero-awake-battery-threshold"},
      {id:"tool.zero.awake.battery.low-power",destinationId:"tool:zero.awake",title:"Stop Awake in low power mode",description:"Applies on battery power",path:"Zero Awake",keywords:["low power mode","energy saver","低电量"],focusTargetId:"preference-setting-tool-zero-awake-battery-low-power"},
    ],
  },
  loadPanel: () => import("./CaffeinePanel").then(({ CaffeinePluginPanel }) => ({
    default: CaffeinePluginPanel,
  })),
};
