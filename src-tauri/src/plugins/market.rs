use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use super::contracts::{PluginMarketEntry, PluginMarketIndex};

pub const DEFAULT_PLUGIN_MARKET_URL: &str =
    "https://raw.githubusercontent.com/bells/zero/main/market.json";
const PREVIEW_PLUGIN_MARKET_URL: &str =
    "https://raw.githubusercontent.com/bells/zero/plugin-preview/market.json";
const MAX_MARKET_INDEX_BYTES: usize = 4 * 1024 * 1024;

fn configured_market_url(
    preview: bool,
    runtime_enabled: bool,
    dev_home: Option<&Path>,
) -> &'static str {
    if cfg!(all(debug_assertions, target_os = "macos"))
        && preview
        && runtime_enabled
        && dev_home.is_some_and(Path::is_absolute)
    {
        PREVIEW_PLUGIN_MARKET_URL
    } else {
        DEFAULT_PLUGIN_MARKET_URL
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketSnapshot {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub catalog: Vec<super::contracts::PluginMarketCatalogEntry>,
    pub source_url: String,
    pub schema_version: u16,
    pub updated_at: Option<String>,
    pub entries: Vec<PluginMarketEntry>,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginMarketError {
    pub message: String,
}

pub struct PluginMarketCache {
    source_url: String,
    cached_snapshot: Option<PluginMarketSnapshot>,
}

pub struct PluginMarketState {
    cache: Mutex<PluginMarketCache>,
}

impl Default for PluginMarketState {
    fn default() -> Self {
        Self {
            cache: Mutex::new(PluginMarketCache::new(configured_market_url(
                std::env::var("ZERO_DEV_PLUGIN_MARKET").as_deref() == Ok("1"),
                super::protocol::web_runtime_enabled(),
                std::env::var_os("ZERO_DEV_HOME").as_deref().map(Path::new),
            ))),
        }
    }
}

impl PluginMarketState {
    pub fn source_url(&self) -> Result<String, PluginMarketError> {
        let cache = self
            .cache
            .lock()
            .map_err(|_| market_error("plugin market cache lock is poisoned"))?;

        Ok(cache.source_url().to_string())
    }

    pub fn refresh_from_json(
        &self,
        market_json: &str,
    ) -> Result<PluginMarketSnapshot, PluginMarketError> {
        let mut diagnostic = crate::services::diagnostics::Operation::new(None, "market");
        let result = (|| {
            self.cache
                .lock()
                .map_err(|_| market_error("plugin market cache lock is poisoned"))?
                .refresh_from_json(market_json)
        })();
        diagnostic.finish(&result);
        result
    }

    pub fn cached_entries(&self) -> Result<Vec<PluginMarketEntry>, PluginMarketError> {
        let cache = self
            .cache
            .lock()
            .map_err(|_| market_error("plugin market cache lock is poisoned"))?;

        Ok(cache
            .cached_snapshot()
            .map(|snapshot| snapshot.entries.clone())
            .unwrap_or_default())
    }
}

impl PluginMarketCache {
    pub fn new(source_url: impl Into<String>) -> Self {
        Self {
            source_url: source_url.into(),
            cached_snapshot: None,
        }
    }

    pub fn cached_snapshot(&self) -> Option<&PluginMarketSnapshot> {
        self.cached_snapshot.as_ref()
    }

    pub fn source_url(&self) -> &str {
        &self.source_url
    }

    pub fn refresh_from_json(
        &mut self,
        market_json: &str,
    ) -> Result<PluginMarketSnapshot, PluginMarketError> {
        let market = parse_market_index(market_json)?;
        validate_market_index(&market)?;

        let snapshot = PluginMarketSnapshot {
            catalog: market.catalog,
            source_url: self.source_url.clone(),
            schema_version: market.schema_version,
            updated_at: market.updated_at,
            entries: market.plugins,
            stale: false,
        };

        self.cached_snapshot = Some(snapshot.clone());

        Ok(snapshot)
    }

    pub fn refresh_with_fetcher<F, E>(
        &mut self,
        fetcher: F,
    ) -> Result<PluginMarketSnapshot, PluginMarketError>
    where
        F: FnOnce(&str) -> Result<String, E>,
        E: std::fmt::Display,
    {
        let market_json = fetcher(&self.source_url)
            .map_err(|error| market_error(format!("failed to fetch market: {error}")))?;

        self.refresh_from_json(&market_json)
    }
}

pub async fn fetch_market_json(source_url: &str) -> Result<String, PluginMarketError> {
    let mut diagnostic = crate::services::diagnostics::Operation::new(None, "market");
    let result = (async {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|error| market_error(format!("failed to create market client: {error}")))?;
        let response = client
            .get(source_url)
            .send()
            .await
            .map_err(|error| market_error(format!("failed to fetch market: {error}")))?;
        let mut response = response
            .error_for_status()
            .map_err(|error| market_error(format!("failed to fetch market: {error}")))?;

        let too_large = || market_error("plugin market index exceeds its byte limit");
        if response
            .content_length()
            .is_some_and(|length| length > MAX_MARKET_INDEX_BYTES as u64)
        {
            return Err(too_large());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| market_error(format!("failed to read market response: {error}")))?
        {
            if chunk.len() > MAX_MARKET_INDEX_BYTES.saturating_sub(bytes.len()) {
                return Err(too_large());
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes).map_err(|_| market_error("plugin market index is not UTF-8"))
    })
    .await;
    diagnostic.finish(&result);
    result
}

fn parse_market_index(market_json: &str) -> Result<PluginMarketIndex, PluginMarketError> {
    serde_json::from_str(market_json)
        .map_err(|error| market_error(format!("failed to parse market json: {error}")))
}

fn validate_market_index(market: &PluginMarketIndex) -> Result<(), PluginMarketError> {
    if market.schema_version != 1 {
        return Err(market_error("market schemaVersion must be 1"));
    }

    if market.plugins.len() > 1000 || market.catalog.len() > 1000 {
        return Err(market_error("market contains too many tools"));
    }
    let mut names = std::collections::HashSet::new();
    for tool in &market.catalog {
        if !super::capabilities::valid_capability_id(&tool.name)
            || !names.insert(&tool.name)
            || !super::versions::is_protocol_version(&tool.version)
            || tool.display_name.is_empty()
            || tool.display_name.len() > 128
            || [
                &tool.description.zh,
                &tool.description.en,
                &tool.unavailable_reason.zh,
                &tool.unavailable_reason.en,
            ]
            .into_iter()
            .any(|text| text.trim().is_empty() || text.len() > 2048)
        {
            return Err(market_error("invalid or duplicate tool catalog metadata"));
        }
    }

    for entry in &market.plugins {
        validate_market_entry(entry)?;
    }

    Ok(())
}

fn validate_market_entry(entry: &PluginMarketEntry) -> Result<(), PluginMarketError> {
    if !is_github_url(&entry.repository) {
        return Err(market_error(format!(
            "plugin {} repository must be an HTTPS GitHub URL",
            entry.name
        )));
    }

    if !is_github_url(&entry.release_url) {
        return Err(market_error(format!(
            "plugin {} releaseUrl must be an HTTPS GitHub URL",
            entry.name
        )));
    }

    if !is_github_url(&entry.download_url) {
        return Err(market_error(format!(
            "plugin {} downloadUrl must be an HTTPS GitHub URL",
            entry.name
        )));
    }

    if !entry.download_url.ends_with(".zplugin") {
        return Err(market_error(format!(
            "plugin {} downloadUrl must point to a .zplugin asset",
            entry.name
        )));
    }

    if let Some(sha256) = &entry.sha256 {
        if sha256.len() != 64
            || !sha256
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(market_error(format!(
                "plugin {} sha256 must be a 64-character hex string",
                entry.name
            )));
        }
    }

    Ok(())
}

fn is_github_url(value: &str) -> bool {
    value.starts_with("https://github.com/")
}

fn market_error(message: impl Into<String>) -> PluginMarketError {
    PluginMarketError {
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_preview_requires_debug_macos_runtime_and_isolated_home() {
        let absolute = std::env::temp_dir();
        assert_eq!(
            configured_market_url(false, true, Some(&absolute)),
            DEFAULT_PLUGIN_MARKET_URL
        );
        assert_eq!(
            configured_market_url(true, false, Some(&absolute)),
            DEFAULT_PLUGIN_MARKET_URL
        );
        assert_eq!(
            configured_market_url(true, true, None),
            DEFAULT_PLUGIN_MARKET_URL
        );
        assert_eq!(
            configured_market_url(true, true, Some(Path::new("relative"))),
            DEFAULT_PLUGIN_MARKET_URL
        );
        let expected = if cfg!(all(debug_assertions, target_os = "macos")) {
            PREVIEW_PLUGIN_MARKET_URL
        } else {
            DEFAULT_PLUGIN_MARKET_URL
        };
        assert_eq!(configured_market_url(true, true, Some(&absolute)), expected);
    }
}
