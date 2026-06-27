use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use super::contracts::{PluginMarketEntry, PluginMarketIndex};

pub const DEFAULT_PLUGIN_MARKET_URL: &str =
    "https://raw.githubusercontent.com/watson/ztool/main/market.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketSnapshot {
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
            cache: Mutex::new(PluginMarketCache::new(DEFAULT_PLUGIN_MARKET_URL)),
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
        self.cache
            .lock()
            .map_err(|_| market_error("plugin market cache lock is poisoned"))?
            .refresh_from_json(market_json)
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
    let response = reqwest::get(source_url)
        .await
        .map_err(|error| market_error(format!("failed to fetch market: {error}")))?;

    response
        .text()
        .await
        .map_err(|error| market_error(format!("failed to read market response: {error}")))
}

fn parse_market_index(market_json: &str) -> Result<PluginMarketIndex, PluginMarketError> {
    serde_json::from_str(market_json)
        .map_err(|error| market_error(format!("failed to parse market json: {error}")))
}

fn validate_market_index(market: &PluginMarketIndex) -> Result<(), PluginMarketError> {
    if market.schema_version != 1 {
        return Err(market_error("market schemaVersion must be 1"));
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
        if sha256.len() != 64 || !sha256.chars().all(|character| character.is_ascii_hexdigit()) {
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
