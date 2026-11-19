export type PaperLocale = 'zh-CN' | 'en-US';
const en = {
  title: 'Zero Paper', source: 'Bing China · China Standard Time', latest: 'Latest', refresh: 'Refresh', older: 'Older', newer: 'Newer',
  download: 'Download', apply: 'Set wallpaper', loading: 'Loading wallpaper cache…', refreshing: 'Refreshing…',
  empty: 'No wallpaper is available yet', previewLoading: 'Loading image…', previewUnavailable: 'Image unavailable',
  offline: 'Offline cache', retry: 'Retry', fallback: 'Bing daily wallpaper', applied: 'Desktop wallpaper updated', saved: 'Image saved',
  daily: 'Daily automatic wallpaper change', runningOnly: 'Updates while Zero is running and Paper is enabled, using the China market day.',
  manualProtection: 'A historical image applied through Paper is kept until the next China midnight. Turn off and on to request the latest image.',
  off: 'Daily automatic change is off', scheduled: 'Automatic changes scheduled', scheduleFailed: 'Preference saved; scheduling failed. Retry to start automatic checks.',
  uncertain: 'A previous wallpaper change has an uncertain outcome. Review it before changing wallpaper again.', recover: 'Review wallpaper state',
  unsupported: 'This environment cannot set wallpaper. Browsing and downloads remain available.', applying: 'Applying…', saving: 'Saving…',
  lastApplied: 'Last successful application', nextCheck: 'Next check', protectedUntil: 'Manual choice protected until',
  storageError: 'Saved settings could not be read or updated safely. Retry; the original value is preserved.',
  archiveError: 'Saved wallpaper metadata is invalid or unavailable. Refresh to try the online archive.',
  networkError: 'Wallpaper data could not be refreshed. Check your connection and retry.',
  imageError: 'The image could not be loaded or saved. Retry to request it again.',
  applyError: 'Wallpaper could not be changed. Retry after checking system permissions.',
  cancelled: 'The operation was cancelled.', unknownDate: '—',
} as const;
type Key = keyof typeof en;
const zh: Record<Key, string> = {
  title: 'Zero Paper', source: 'Bing 中国区 · 北京时间', latest: '回到最新', refresh: '立即刷新', older: '更早', newer: '更新',
  download: '下载图片', apply: '设为桌面壁纸', loading: '正在读取壁纸缓存…', refreshing: '更新中…',
  empty: '暂时没有可用壁纸', previewLoading: '正在载入图片…', previewUnavailable: '图片暂不可用',
  offline: '离线缓存', retry: '重试', fallback: 'Bing 每日壁纸', applied: '已设为桌面壁纸', saved: '图片已保存',
  daily: '每日自动更换壁纸', runningOnly: '仅在 Zero 运行且 Paper 启用时更新，按北京时间检查每日图片。',
  manualProtection: '通过 Paper 成功应用历史图后，当天不再自动覆盖。关闭再开启可立即尝试最新图。',
  off: '每日自动更新已关闭', scheduled: '已安排自动更新', scheduleFailed: '设置已保存，但调度失败。请重试以启动自动检查。',
  uncertain: '上次更换壁纸的结果尚不确定。请先检查状态，再次更换壁纸。', recover: '检查壁纸状态',
  unsupported: '当前环境不支持设置壁纸，仍可浏览和下载图片。', applying: '正在应用…', saving: '正在保存…',
  lastApplied: '最近成功应用', nextCheck: '下次检查', protectedUntil: '手动选择保护至',
  storageError: '无法安全读取或更新设置，原始数据已保留，请重试。',
  archiveError: '缓存的壁纸信息无效或暂不可用，请刷新在线数据。',
  networkError: '无法更新壁纸信息，请检查网络后重试。', imageError: '图片载入或保存失败，请重试。',
  applyError: '壁纸更换失败，请检查系统权限后重试。', cancelled: '操作已取消。', unknownDate: '—',
};
export function paperTranslator(locale: PaperLocale): (key: Key) => string {const messages = locale === 'zh-CN' ? zh : en; return key => messages[key];}
export function errorMessageKey(code: string): Key {
  switch (code) {
    case 'paper.storage': return 'storageError'; case 'paper.archive': return 'archiveError'; case 'paper.network': return 'networkError';
    case 'paper.image': return 'imageError'; case 'paper.schedule': return 'scheduleFailed'; case 'paper.uncertain': return 'uncertain';
    case 'paper.unsupported': return 'unsupported'; case 'paper.cancelled': return 'cancelled'; default: return 'applyError';
  }
}
