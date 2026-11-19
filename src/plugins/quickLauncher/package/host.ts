import type {ApplicationPage, CatalogApplication, JsonValue, Result, ZeroBridge} from "@zero/sdk";
import {readUsage, recordUse} from "./search.js";

const USAGE = "application-usage.v1";

export interface LaunchIndex {
  catalogId: string;
  items: CatalogApplication[];
}

export async function loadIndex(bridge: ZeroBridge): Promise<Result<LaunchIndex>> {
  const scan = await bridge.request("apps.scan", {});
  if (!scan.ok) return scan;
  const {catalogId, itemCount} = scan.value;
  const items: CatalogApplication[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: Result<ApplicationPage> = await bridge.request("apps.page", {catalogId, offset});
    if (!page.ok) return page;
    items.push(...page.value.items);
    const next: number | null = page.value.nextOffset;
    if (items.length > itemCount || (next === null ? items.length !== itemCount : next !== items.length || next <= offset)) {
      return {ok: false, error: {code: "apps.invalidCatalog", message: "Invalid application catalog", retryable: false}};
    }
    offset = next;
  }
  return {ok: true, value: {catalogId, items}};
}

export async function loadUsage(bridge: ZeroBridge) {
  const result = await bridge.request("storage.get", {key: USAGE});
  return readUsage(result.ok ? result.value : null);
}

export async function saveUse(bridge: ZeroBridge, id: string, at: number) {
  const result = await bridge.request("storage.get", {key: USAGE});
  if (!result.ok) return null;
  let expected: JsonValue = result.value;
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = recordUse(readUsage(expected), id, at);
    const value = Object.fromEntries(Object.entries(next).map(([itemId, {count, last}]) => [itemId, {count, last}]));
    const commit = await bridge.request("storage.compareAndSet", {key: USAGE, expectedValue: expected, value});
    if (!commit.ok) return null;
    if (commit.value.swapped) return next;
    expected = commit.value.currentValue;
  }
  return null;
}
