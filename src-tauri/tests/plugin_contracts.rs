use serde_json::json;
use ztool_lib::plugins::contracts::{
    PluginManifest, PluginMarketIndex, PluginPermission,
};

#[test]
fn deserializes_plugin_manifest_contract() {
    let manifest: PluginManifest = serde_json::from_value(json!({
        "name": "clipboard-helper",
        "version": "0.1.0",
        "author": "watson",
        "main": "dist/index.html",
        "permissions": ["clipboard.read", "network"],
        "engines": {
            "ztool": "0.1.0",
            "api": "1"
        }
    }))
    .expect("manifest should deserialize");

    assert_eq!(manifest.name, "clipboard-helper");
    assert_eq!(manifest.permissions, vec![
        PluginPermission::ClipboardRead,
        PluginPermission::Network,
    ]);
    assert_eq!(manifest.engines.expect("engines").api.as_deref(), Some("1"));
}

#[test]
fn deserializes_market_index_contract() {
    let market: PluginMarketIndex = serde_json::from_value(json!({
        "schemaVersion": 1,
        "updatedAt": "2026-06-21T00:00:00Z",
        "plugins": [
            {
                "name": "clipboard-helper",
                "version": "0.1.0",
                "author": "watson",
                "repository": "https://github.com/watson/clipboard-helper",
                "releaseUrl": "https://github.com/watson/clipboard-helper/releases/tag/v0.1.0",
                "downloadUrl": "https://github.com/watson/clipboard-helper/releases/download/v0.1.0/clipboard-helper.zplugin",
                "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "permissions": ["clipboard.read"]
            }
        ]
    }))
    .expect("market index should deserialize");

    assert_eq!(market.schema_version, 1);
    assert_eq!(market.plugins[0].download_url.ends_with(".zplugin"), true);
}
