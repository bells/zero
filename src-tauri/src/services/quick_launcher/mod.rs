pub mod cache;
pub mod catalog;
pub mod contracts;
pub mod model;
pub mod platform;
pub mod search;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Manager;

use self::contracts::{
    launcher_error, QuickLauncherActivateInput, QuickLauncherActivationResult,
    QuickLauncherDiagnostic, QuickLauncherError, QuickLauncherIconInput, QuickLauncherIconResult,
    QuickLauncherIndexSnapshot, QuickLauncherIndexSource, QuickLauncherItemKind,
    QuickLauncherPlatformSupport, QuickLauncherSearchInput, QuickLauncherSearchResult,
};
use self::model::{current_platform_key, IndexedItem, LaunchTarget, UsageMap};
use self::search::{default_matcher, search_items};

struct LauncherIndex {
    revision: u64,
    source: QuickLauncherIndexSource,
    refreshing: bool,
    items: Vec<IndexedItem>,
    usage: UsageMap,
    last_updated_at: Option<u64>,
    platform_support: QuickLauncherPlatformSupport,
    diagnostics: Vec<QuickLauncherDiagnostic>,
}

#[derive(Default)]
struct RunningCache {
    captured_at: Option<Instant>,
    values: HashMap<String, contracts::QuickLauncherRunningState>,
}

pub struct QuickLauncherState {
    root: std::path::PathBuf,
    index: RwLock<LauncherIndex>,
    matcher: Mutex<nucleo_matcher::Matcher>,
    refresh_gate: Mutex<()>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    running_cache: Mutex<RunningCache>,
    icon_cache: Mutex<HashMap<String, Option<String>>>,
}

impl Default for QuickLauncherState {
    fn default() -> Self {
        Self::new(cache::default_root())
    }
}

impl QuickLauncherState {
    pub fn new(root: std::path::PathBuf) -> Self {
        let mut diagnostics = Vec::new();
        let (items, last_updated_at, source) = match cache::load_index(&root) {
            Ok(Some((items, updated_at))) => {
                (items, Some(updated_at), QuickLauncherIndexSource::Cache)
            }
            Ok(None) => (Vec::new(), None, QuickLauncherIndexSource::Empty),
            Err(error) => {
                diagnostics.push(QuickLauncherDiagnostic {
                    code: "launcher.cache_rebuilt".into(),
                    message: error,
                });
                (Vec::new(), None, QuickLauncherIndexSource::Empty)
            }
        };
        let usage = match cache::load_usage(&root) {
            Ok(usage) => usage,
            Err(error) => {
                diagnostics.push(QuickLauncherDiagnostic {
                    code: "launcher.usage_rebuilt".into(),
                    message: error,
                });
                UsageMap::new()
            }
        };
        let platform_support = if matches!(current_platform_key(), "macos" | "windows") {
            QuickLauncherPlatformSupport::Supported
        } else {
            QuickLauncherPlatformSupport::Unsupported
        };
        Self {
            root,
            index: RwLock::new(LauncherIndex {
                revision: u64::from(!items.is_empty()),
                source,
                refreshing: false,
                items,
                usage,
                last_updated_at,
                platform_support,
                diagnostics,
            }),
            matcher: Mutex::new(default_matcher()),
            refresh_gate: Mutex::new(()),
            watcher: Mutex::new(None),
            running_cache: Mutex::new(RunningCache::default()),
            icon_cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn snapshot(&self) -> Result<QuickLauncherIndexSnapshot, QuickLauncherError> {
        let index = self.index.read().map_err(|_| lock_error("read index"))?;
        Ok(snapshot_from_index(&index))
    }

    pub fn refresh(
        &self,
        language: &str,
    ) -> Result<QuickLauncherIndexSnapshot, QuickLauncherError> {
        let _refresh = match self.refresh_gate.try_lock() {
            Ok(guard) => guard,
            Err(std::sync::TryLockError::WouldBlock) => return self.snapshot(),
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err(lock_error("start refresh"));
            }
        };
        {
            let mut index = self.index.write().map_err(|_| lock_error("mark refresh"))?;
            index.refreshing = true;
        }

        let mut scan = platform::scan();
        scan.items.extend(catalog::system_setting_items(language));
        let running = platform::probe_running(&scan.items);
        for item in &mut scan.items {
            if let Some(state) = running.get(&item.id) {
                item.running = *state;
            }
        }
        scan.items.sort_by(|left, right| left.id.cmp(&right.id));
        scan.items.dedup_by(|left, right| left.id == right.id);
        if let Ok(mut runtime) = self.running_cache.lock() {
            runtime.captured_at = Some(Instant::now());
            runtime.values = scan
                .items
                .iter()
                .map(|item| (item.id.clone(), item.running))
                .collect();
        }
        let updated_at = now_timestamp();
        let save_error = cache::save_index(&self.root, &scan.items, updated_at).err();

        let mut index = self
            .index
            .write()
            .map_err(|_| lock_error("publish refresh"))?;
        index.revision = index.revision.saturating_add(1).max(1);
        index.source = QuickLauncherIndexSource::Scan;
        index.refreshing = false;
        index.items = scan.items;
        index.last_updated_at = Some(updated_at);
        index.diagnostics = scan.diagnostics;
        if let Some(error) = save_error {
            index.diagnostics.push(QuickLauncherDiagnostic {
                code: "launcher.cache_write_failed".into(),
                message: error,
            });
            index.platform_support = QuickLauncherPlatformSupport::Degraded;
        } else if current_platform_key() == "unsupported" {
            index.platform_support = QuickLauncherPlatformSupport::Unsupported;
        } else if index.diagnostics.is_empty() {
            index.platform_support = QuickLauncherPlatformSupport::Supported;
        } else {
            index.platform_support = QuickLauncherPlatformSupport::Degraded;
        }
        Ok(snapshot_from_index(&index))
    }

    pub fn search(
        &self,
        input: QuickLauncherSearchInput,
    ) -> Result<QuickLauncherSearchResult, QuickLauncherError> {
        let index = self
            .index
            .read()
            .map_err(|_| lock_error("read search index"))?;
        let mut items = index.items.clone();
        let running = self.running_states(&items)?;
        for item in &mut items {
            if let Some(state) = running.get(&item.id) {
                item.running = *state;
            }
        }
        let mut matcher = self
            .matcher
            .lock()
            .map_err(|_| lock_error("lock matcher"))?;
        search_items(index.revision, &items, &index.usage, input, &mut matcher)
    }

    pub fn icon(
        &self,
        input: QuickLauncherIconInput,
    ) -> Result<QuickLauncherIconResult, QuickLauncherError> {
        let index = self
            .index
            .read()
            .map_err(|_| lock_error("read icon index"))?;
        let item = index
            .items
            .iter()
            .find(|item| item.id == input.item_id)
            .ok_or_else(stale_item_error)?;
        if let Some(expected) = input.icon_key.as_deref() {
            if item.icon_key.as_deref() != Some(expected) {
                return Err(stale_item_error());
            }
        }
        let cache_key = item.icon_key.clone().unwrap_or_else(|| item.id.clone());
        if let Some(data_url) = self
            .icon_cache
            .lock()
            .map_err(|_| lock_error("read icon cache"))?
            .get(&cache_key)
            .cloned()
        {
            return Ok(QuickLauncherIconResult {
                item_id: item.id.clone(),
                data_url,
            });
        }
        let bytes = platform::load_icon(item)?;
        let data_url =
            bytes.map(|bytes| format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes)));
        let mut icons = self
            .icon_cache
            .lock()
            .map_err(|_| lock_error("write icon cache"))?;
        if icons.len() >= 128 {
            if let Some(oldest_key) = icons.keys().next().cloned() {
                icons.remove(&oldest_key);
            }
        }
        icons.insert(cache_key, data_url.clone());
        Ok(QuickLauncherIconResult {
            item_id: item.id.clone(),
            data_url,
        })
    }

    pub fn activate(
        &self,
        input: QuickLauncherActivateInput,
    ) -> Result<QuickLauncherActivationResult, QuickLauncherError> {
        let item = {
            let index = self
                .index
                .read()
                .map_err(|_| lock_error("read activation index"))?;
            index
                .items
                .iter()
                .find(|item| item.id == input.item_id)
                .cloned()
                .ok_or_else(stale_item_error)?
        };
        let action = match (&item.kind, &item.target) {
            (QuickLauncherItemKind::Application, LaunchTarget::Application { .. }) => {
                platform::activate(&item)?
            }
            (QuickLauncherItemKind::SystemSetting, LaunchTarget::SystemSetting { uri }) => {
                platform::open_setting(uri)?
            }
            _ => {
                return Err(launcher_error(
                    "launcher.activate",
                    "launcher.item_kind_invalid",
                    "Launcher item kind does not match its private target.",
                    false,
                ));
            }
        };
        let activated_at = now_timestamp();
        let mut index = self.index.write().map_err(|_| lock_error("write usage"))?;
        let fallback_count = index
            .usage
            .get(&item.id)
            .map(|entry| entry.count.saturating_add(1))
            .unwrap_or(1);
        let usage_count = match cache::record_successful_use(
            &self.root,
            &mut index.usage,
            &item.id,
            activated_at,
        ) {
            Ok(count) => count,
            Err(error) => {
                index.diagnostics.push(QuickLauncherDiagnostic {
                    code: "launcher.usage_write_failed".into(),
                    message: error,
                });
                fallback_count
            }
        };
        Ok(QuickLauncherActivationResult {
            item_id: item.id,
            action,
            usage_count,
            activated_at,
        })
    }

    pub fn add_diagnostic(&self, code: &str, message: impl Into<String>) {
        if let Ok(mut index) = self.index.write() {
            index.diagnostics.push(QuickLauncherDiagnostic {
                code: code.into(),
                message: message.into(),
            });
            if index.platform_support == QuickLauncherPlatformSupport::Supported {
                index.platform_support = QuickLauncherPlatformSupport::Degraded;
            }
        }
    }

    fn running_states(
        &self,
        items: &[IndexedItem],
    ) -> Result<HashMap<String, contracts::QuickLauncherRunningState>, QuickLauncherError> {
        let mut cache = self
            .running_cache
            .lock()
            .map_err(|_| lock_error("read running-state cache"))?;
        if cache
            .captured_at
            .is_some_and(|captured| captured.elapsed() < Duration::from_secs(2))
        {
            return Ok(cache.values.clone());
        }
        cache.values = platform::probe_running(items);
        cache.captured_at = Some(Instant::now());
        Ok(cache.values.clone())
    }

    pub fn start_watcher(&self, app: tauri::AppHandle) -> Result<(), String> {
        let roots = platform::application_roots()
            .into_iter()
            .filter(|root| root.exists())
            .collect::<Vec<_>>();
        if roots.is_empty() {
            self.add_diagnostic(
                "launcher.watcher_unavailable",
                "No supported application directory is available to watch.",
            );
            return Ok(());
        }
        let queued = Arc::new(AtomicBool::new(false));
        let callback_queued = queued.clone();
        let callback_app = app.clone();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if let Err(error) = event {
                    callback_app
                        .state::<QuickLauncherState>()
                        .add_diagnostic("launcher.watcher_event_failed", error.to_string());
                    return;
                }
                if callback_queued.swap(true, Ordering::AcqRel) {
                    return;
                }
                let delayed_app = callback_app.clone();
                let delayed_queued = callback_queued.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(500));
                    let state = delayed_app.state::<QuickLauncherState>();
                    let _ = state.refresh(&system_language());
                    delayed_queued.store(false, Ordering::Release);
                });
            })
            .map_err(|error| format!("failed to create launcher watcher: {error}"))?;
        for root in roots {
            if let Err(error) = watcher.watch(&root, RecursiveMode::Recursive) {
                self.add_diagnostic(
                    "launcher.watcher_root_failed",
                    format!("Could not watch {}: {error}", root.display()),
                );
            }
        }
        let mut slot = self
            .watcher
            .lock()
            .map_err(|_| "launcher watcher lock is poisoned".to_string())?;
        *slot = Some(watcher);
        Ok(())
    }
}

pub fn system_language() -> String {
    std::env::var("LANG").unwrap_or_else(|_| "en-US".into())
}

fn snapshot_from_index(index: &LauncherIndex) -> QuickLauncherIndexSnapshot {
    QuickLauncherIndexSnapshot {
        revision: index.revision,
        source: index.source,
        refreshing: index.refreshing,
        item_count: index.items.len(),
        last_updated_at: index.last_updated_at,
        platform_support: index.platform_support,
        diagnostics: index.diagnostics.clone(),
    }
}

fn now_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn lock_error(action: &str) -> QuickLauncherError {
    launcher_error(
        "launcher.state",
        "launcher.state_unavailable",
        format!("Could not {action} because launcher state is unavailable."),
        true,
    )
}

fn stale_item_error() -> QuickLauncherError {
    launcher_error(
        "launcher.activate",
        "launcher.item_stale",
        "The selected launcher item is stale or no longer installed.",
        true,
    )
}

#[cfg(test)]
mod tests {
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    use super::*;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    #[test]
    fn unsupported_platform_is_explicit() {
        let state = QuickLauncherState::new(std::env::temp_dir().join("zero-unsupported"));
        assert_eq!(
            state.snapshot().unwrap().platform_support,
            QuickLauncherPlatformSupport::Unsupported
        );
    }
}
