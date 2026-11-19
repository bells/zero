import type {CatalogApplication, JsonValue} from "@zero/sdk";

export interface Use {
  count: number;
  last: number;
}
export type Usage = Record<string, Use>;
const MAX_HISTORY = 128;

export function readUsage(value: JsonValue): Usage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const usage: Usage = {};
  for (const [id, entry] of Object.entries(value).slice(0, MAX_HISTORY)) {
    if (/^[a-f0-9]{64}$/.test(id) && entry && typeof entry === "object" && !Array.isArray(entry)
      && typeof entry.count === "number" && Number.isSafeInteger(entry.count) && entry.count > 0
      && typeof entry.last === "number" && Number.isSafeInteger(entry.last) && entry.last > 0) {
      usage[id] = {count: entry.count, last: entry.last};
    }
  }
  return usage;
}

export function recordUse(usage: Usage, id: string, now: number): Usage {
  return Object.fromEntries(Object.entries({
    ...usage,
    [id]: {count: Math.min((usage[id]?.count ?? 0) + 1, 10_000), last: now},
  }).sort(([, a], [, b]) => b.last - a.last).slice(0, MAX_HISTORY));
}

function aliases(title: string): string {
  if (title.includes("photoshop")) return "ps adobe ps";
  if (title.includes("visual studio code")) return "vscode code";
  if (title.includes("wechat") || title.includes("微信")) return "wx weixin wechat";
  if (title.includes("chrome")) return "chrome gc";
  return "";
}

function fieldScore(text: string, query: string): number {
  if (text === query) return 400;
  if (text.startsWith(query)) return 300;
  if (text.includes(query)) return 200;
  let cursor = 0;
  for (const character of query) {
    const index = text.indexOf(character, cursor);
    if (index < 0) return 0;
    cursor = index + character.length;
  }
  return 100 - Math.min(cursor, 80);
}

export function searchApplications(items: CatalogApplication[], query: string, usage: Usage, now: number) {
  const key = query.normalize("NFC").trim().toLowerCase();
  return items.flatMap(item => {
    const title = item.title.normalize("NFC").toLowerCase();
    const score = key ? Math.max(...([
      [title, 40], [item.wordInitials, 30], [item.pinyin, 24],
      [item.pinyinInitials, 26], [aliases(title), 34],
    ] as const).map(([field, bonus]) => {
      const match = fieldScore(field, key);
      return match ? match + bonus : 0;
    })) : 0;
    if (key && score === 0) return [];
    const history = usage[item.id];
    const ageDays = history ? Math.max(0, now - history.last) / 86_400_000 : Infinity;
    const historyBonus = Math.min(30, Math.log2(1 + (history?.count ?? 0)) * 6) + Math.max(0, 20 - ageDays);
    return [{item, score: score + historyBonus, last: history?.last ?? 0}];
  }).sort((a, b) => b.score - a.score || b.last - a.last || a.item.title.localeCompare(b.item.title)
    || a.item.id.localeCompare(b.item.id)).slice(0, 24).map(result => result.item);
}
