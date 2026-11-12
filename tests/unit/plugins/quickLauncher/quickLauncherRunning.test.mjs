import assert from "node:assert/strict";
import test from "node:test";
import * as scheduling from "/private/tmp/zero-tests/plugins/quickLauncher/quickLauncherScheduling.js";
import { resolveShortcutActivation } from "/private/tmp/zero-tests/plugins/quickLauncher/quickLauncherShortcuts.js";

const item = (id, running) => ({ id, kind: "application", title: id, subtitle: `/Applications/${id}.app`, running, matchedField: "title" });
const displayed = { revision: 3, query: "", elapsedMicros: 1, items: [item("a", "notRunning"), item("b", "running")] };

test("running refresh merges badges without reordering displayed numeric targets", () => {
  const next = scheduling.mergeLauncherRunningResult(displayed, { ...displayed, items: [item("b", "notRunning"), item("a", "running")] });
  assert.deepEqual(next.items.map(({ id, running }) => [id, running]), [["a", "running"], ["b", "notRunning"]]);
  assert.deepEqual(resolveShortcutActivation({ itemId: "a", revision: 3, query: "" }, next, "", false), { itemId: "a", revision: 3, query: "" });
  assert.equal(displayed.items[0].running, "notRunning");
});

test("new query, invalidated index or missing displayed items require foreground reconciliation", () => {
  for (const next of [{ ...displayed, query: "b" }, { ...displayed, revision: 4 }, { ...displayed, items: [] }]) {
    assert.equal(scheduling.mergeLauncherRunningResult(displayed, next), null);
  }
});

test("unchanged polls retain the same result object", () => {
  assert.equal(scheduling.mergeLauncherRunningResult(displayed, structuredClone(displayed)), displayed);
});
