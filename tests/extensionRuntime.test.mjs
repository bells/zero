import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExtensionSurfacePolicy,
  createExtensionBridge,
  markPluginFailure,
} from "/private/tmp/ztool-extension-runtime-test/extensionBridge.js";

function pluginRecord(permissions = ["ui.message"], enabled = true) {
  return {
    name: "bridge-tool",
    version: "0.1.0",
    author: "watson",
    source: "local",
    enabled,
    health: enabled ? "ready" : "disabled",
    manifest: {
      name: "bridge-tool",
      version: "0.1.0",
      author: "watson",
      main: "dist/index.html",
      permissions,
    },
    approvedPermissions: permissions,
  };
}

test("extension surface policy isolates plugin code from direct native APIs", () => {
  const policy = buildExtensionSurfacePolicy();

  assert.equal(policy.sandbox, "allow-scripts");
  assert.match(policy.csp, /default-src 'none'/);
  assert.doesNotMatch(policy.csp, /tauri/);
});

test("extension bridge executes allowed UI message request", async () => {
  const messages = [];
  const bridge = createExtensionBridge(pluginRecord(), {
    showMessage: async (message) => {
      messages.push(message);
    },
  });

  const result = await bridge.handle({
    requestId: "1",
    pluginName: "bridge-tool",
    method: "ui.showMessage",
    payload: { message: "hello" },
  });

  assert.deepEqual(result, { requestId: "1", ok: true });
  assert.deepEqual(messages, ["hello"]);
});

test("extension bridge denies undeclared permissions and disabled plugins", async () => {
  const bridge = createExtensionBridge(pluginRecord(["ui.message"]), {});
  const denied = await bridge.handle({
    requestId: "2",
    pluginName: "bridge-tool",
    method: "storage.get",
    payload: { key: "token" },
  });
  const disabledBridge = createExtensionBridge(pluginRecord(["storage.plugin"], false), {});
  const disabled = await disabledBridge.handle({
    requestId: "3",
    pluginName: "bridge-tool",
    method: "storage.get",
    payload: { key: "token" },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, "permission.denied");
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error?.code, "plugin.disabled");
});

test("failed plugin records are isolated from host shell state", () => {
  const failed = markPluginFailure(pluginRecord(), "view failed to load");

  assert.equal(failed.enabled, false);
  assert.equal(failed.health, "error");
  assert.equal(failed.lastError, "view failed to load");
});
