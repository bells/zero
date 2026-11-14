use zero_lib::plugins::market::{PluginMarketCache, DEFAULT_PLUGIN_MARKET_URL};

#[test]
fn repository_market_index_is_accepted_by_host() {
    let json = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../market.json"),
    )
    .expect("the default market URL must have a repository index");
    let snapshot = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL)
        .refresh_from_json(&json)
        .expect("repository index must be accepted by the host");
    assert_eq!(snapshot.schema_version, 1);
    assert!(!snapshot.stale);
}

#[test]
fn http_error_is_reported_before_parsing_and_keeps_cached_entries() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/market.json", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = [0; 4096];
        stream.read(&mut request).unwrap();
        stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 14\r\nConnection: close\r\n\r\n404: Not Found").unwrap();
    });
    let response =
        tauri::async_runtime::block_on(zero_lib::plugins::market::fetch_market_json(&url));
    server.join().unwrap();
    let mut cache = PluginMarketCache::new(&url);
    cache.refresh_from_json(valid_market_json()).unwrap();
    let error = cache
        .refresh_with_fetcher(|_| response.map_err(|error| error.message))
        .expect_err("an HTTP error must not become a successful JSON response");
    assert!(error.message.contains("404"), "{}", error.message);
    assert!(!error.message.contains("parse"), "{}", error.message);
    assert_eq!(cache.cached_snapshot().unwrap().entries.len(), 1);
}

fn valid_market_json() -> &'static str {
    r#"{
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
                "permissions": ["clipboard.read"]
            }
        ]
    }"#
}

#[test]
fn parses_and_caches_valid_market_json() {
    let mut cache = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL);

    let snapshot = cache
        .refresh_from_json(valid_market_json())
        .expect("market should parse");

    assert_eq!(snapshot.source_url, DEFAULT_PLUGIN_MARKET_URL);
    assert_eq!(snapshot.entries.len(), 1);
    assert!(snapshot.entries[0].download_url.ends_with(".zplugin"));
    assert_eq!(cache.cached_snapshot().expect("cached").entries.len(), 1);
}

#[test]
fn refresh_with_fetcher_uses_configured_market_url() {
    let mut cache = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL);

    let snapshot = cache
        .refresh_with_fetcher(|url| {
            assert_eq!(url, DEFAULT_PLUGIN_MARKET_URL);
            Ok::<_, String>(valid_market_json().to_string())
        })
        .expect("market should refresh through fetcher");

    assert_eq!(snapshot.entries[0].name, "clipboard-helper");
}

#[test]
fn invalid_market_json_keeps_previous_cache() {
    let mut cache = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL);
    cache
        .refresh_from_json(valid_market_json())
        .expect("initial market should parse");

    let error = cache
        .refresh_from_json("{ definitely not json")
        .expect_err("invalid market should fail");

    assert!(error.message.contains("parse"));
    assert_eq!(cache.cached_snapshot().expect("cached").entries.len(), 1);
}

#[test]
fn fetch_failure_keeps_previous_cache() {
    let mut cache = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL);
    cache
        .refresh_from_json(valid_market_json())
        .expect("initial market should parse");

    let error = cache
        .refresh_with_fetcher(|_| Err::<String, _>("network unavailable"))
        .expect_err("fetch failure should fail");

    assert!(error.message.contains("failed to fetch"));
    assert_eq!(cache.cached_snapshot().expect("cached").entries.len(), 1);
}

#[test]
fn invalid_market_entry_is_rejected() {
    let mut cache = PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL);
    let error = cache
        .refresh_from_json(
            r#"{
                "schemaVersion": 1,
                "plugins": [
                    {
                        "name": "bad-plugin",
                        "version": "0.1.0",
                        "author": "watson",
                        "repository": "https://github.com/watson/bad-plugin",
                        "releaseUrl": "https://github.com/watson/bad-plugin/releases/tag/v0.1.0",
                        "downloadUrl": "https://github.com/watson/bad-plugin/releases/download/v0.1.0/bad-plugin.zip",
                        "permissions": ["clipboard.read"]
                    }
                ]
            }"#,
        )
        .expect_err("non-zplugin asset should fail");

    assert!(error.message.contains(".zplugin"));
    assert!(cache.cached_snapshot().is_none());
}
