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

function pluginRecordWithApproval(declared, approved) {
  return {
    ...pluginRecord(declared),
    approvedPermissions: approved,
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

test("extension bridge requires both declared and approved native permissions", async () => {
  const approvedOnly = createExtensionBridge(
    pluginRecordWithApproval(["ui.message"], ["ui.message", "system.wallpaper"]),
    { systemSetWallpaper: async () => undefined },
  );
  const declaredOnly = createExtensionBridge(
    pluginRecordWithApproval(["system.wallpaper"], []),
    { systemSetWallpaper: async () => undefined },
  );

  for (const [requestId, bridge] of [["approved-only", approvedOnly], ["declared-only", declaredOnly]]) {
    const response = await bridge.handle({
      requestId,
      pluginName: "bridge-tool",
      method: "system.setWallpaper",
      payload: { relativePath: "images/today.jpg" },
    });
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "permission.denied");
  }
});

test("extension bridge dispatches typed native resource requests with plugin identity", async () => {
  const calls = [];
  const bridge = createExtensionBridge(
    pluginRecord(["network", "storage.plugin", "system.wallpaper"]),
    {
      networkFetch: async (pluginName, request) => {
        calls.push(["network", pluginName, request]);
        return { status: 200, bodyBase64: "e30=" };
      },
      storageWriteFile: async (pluginName, request) => {
        calls.push(["storage", pluginName, request]);
        return { relativePath: request.relativePath, bytesWritten: 1 };
      },
      systemSetWallpaper: async (pluginName, request) => {
        calls.push(["wallpaper", pluginName, request]);
        return { relativePath: request.relativePath };
      },
    },
  );

  const network = await bridge.handle({
    requestId: "network",
    pluginName: "bridge-tool",
    method: "network.fetch",
    payload: { url: "https://www.bing.com/", method: "GET" },
  });
  const storage = await bridge.handle({
    requestId: "storage",
    pluginName: "bridge-tool",
    method: "storage.writeFile",
    payload: { relativePath: "images/today.jpg", dataBase64: "AA==" },
  });
  const wallpaper = await bridge.handle({
    requestId: "wallpaper",
    pluginName: "bridge-tool",
    method: "system.setWallpaper",
    payload: { relativePath: "images/today.jpg" },
  });

  assert.equal(network.ok, true);
  assert.equal(storage.ok, true);
  assert.equal(wallpaper.ok, true);
  assert.deepEqual(calls, [
    ["network", "bridge-tool", { url: "https://www.bing.com/", method: "GET" }],
    ["storage", "bridge-tool", { relativePath: "images/today.jpg", dataBase64: "AA==" }],
    ["wallpaper", "bridge-tool", { relativePath: "images/today.jpg" }],
  ]);
});

test("extension bridge rejects identity mismatches and malformed native payloads", async () => {
  const bridge = createExtensionBridge(
    pluginRecord(["network", "system.wallpaper"]),
    {
      networkFetch: async () => undefined,
      systemSetWallpaper: async () => undefined,
    },
  );
  const identity = await bridge.handle({
    requestId: "identity",
    pluginName: "another-plugin",
    method: "network.fetch",
    payload: { url: "https://www.bing.com/" },
  });
  const malformed = await bridge.handle({
    requestId: "malformed",
    pluginName: "bridge-tool",
    method: "system.setWallpaper",
    payload: { relativePath: 42 },
  });

  assert.equal(identity.error?.code, "plugin.identity");
  assert.equal(malformed.error?.code, "host.error");
  assert.match(malformed.error?.message ?? "", /relativePath/);
});

test("failed plugin records are isolated from host shell state", () => {
  const failed = markPluginFailure(pluginRecord(), "view failed to load");

  assert.equal(failed.enabled, false);
  assert.equal(failed.health, "error");
  assert.equal(failed.lastError, "view failed to load");
});
