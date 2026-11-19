use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::services::application_catalog::{discover_applications, Activation, ApplicationTarget};
use crate::services::text_search::{transform_text, TextCase, TransformOptions, Whitespace};

use super::protocol::{PluginError, PluginMethod, PluginRequest, MAX_APPLICATION_CATALOG_ITEMS};
use super::session::{error, Sessions};
use super::web_assets::WebSessions;
use super::web_runtime::with_live_capability;

const MAX_RETAINED_BYTES: usize = 2 * 1024 * 1024;
const PAGE_SIZE: usize = 128;
const MAX_TITLE_CHARS: usize = 128;
const CATALOG_LIFETIME: Duration = Duration::from_secs(600);

#[derive(Default)]
pub(crate) struct ApplicationScanGate(AtomicBool);

struct ScanPermit<'a>(&'a AtomicBool);
impl Drop for ScanPermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl ApplicationScanGate {
    fn acquire(&self) -> Result<ScanPermit<'_>, PluginError> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| PluginError {
                retryable: true,
                ..error("apps.busy")
            })?;
        Ok(ScanPermit(&self.0))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Application {
    id: String,
    title: String,
    word_initials: String,
    pinyin: String,
    pinyin_initials: String,
}

struct Entry {
    public: Application,
    target: ApplicationTarget,
}

pub(crate) struct Catalog {
    id: String,
    entries: Vec<Entry>,
    expires: Instant,
}

impl Catalog {
    fn scan(cancelled: impl Fn() -> bool) -> Result<Self, PluginError> {
        let discovered = discover_applications(&cancelled).map_err(|failure| match failure {
            crate::services::application_catalog::DiscoveryError::Cancelled => {
                error("request.cancelled")
            }
            _ => error("apps.indexLimit"),
        })?;
        if discovered.candidates.len() > MAX_APPLICATION_CATALOG_ITEMS {
            return Err(error("apps.indexLimit"));
        }
        let mut entries = Vec::new();
        let mut remaining_bytes = MAX_RETAINED_BYTES;
        for candidate in discovered.candidates {
            if cancelled() {
                return Err(error("request.cancelled"));
            }
            let Some(target) = ApplicationTarget::from_candidate(&candidate) else {
                continue;
            };
            let title: String = candidate
                .title
                .trim()
                .chars()
                .take(MAX_TITLE_CHARS)
                .collect();
            let terms = transform_text(
                &title,
                TransformOptions {
                    case: TextCase::Lowercase,
                    whitespace: Whitespace::Collapse,
                },
                &cancelled,
            )
            .map_err(|_| error("request.cancelled"))?;
            let id = format!("{:x}", Sha256::digest(candidate.identity.as_bytes()));
            let entry_bytes = std::mem::size_of::<Entry>()
                + title.len()
                + id.len()
                + terms.word_initials.len()
                + terms.pinyin_full.len()
                + terms.pinyin_initials.len()
                + target.retained_path_bytes();
            remaining_bytes = remaining_bytes
                .checked_sub(entry_bytes)
                .ok_or_else(|| error("apps.indexLimit"))?;
            entries.push(Entry {
                public: Application {
                    id,
                    title,
                    word_initials: terms.word_initials,
                    pinyin: terms.pinyin_full,
                    pinyin_initials: terms.pinyin_initials,
                },
                target,
            });
        }
        let mut nonce = [0_u8; 32];
        getrandom::fill(&mut nonce).map_err(|_| error("session.entropy"))?;
        Ok(Self {
            id: nonce.iter().map(|byte| format!("{byte:02x}")).collect(),
            entries,
            expires: Instant::now() + CATALOG_LIFETIME,
        })
    }

    fn page(&self, offset: usize) -> Result<Value, PluginError> {
        if offset > self.entries.len() || offset % PAGE_SIZE != 0 {
            return Err(error("request.invalid"));
        }
        let end = (offset + PAGE_SIZE).min(self.entries.len());
        let items: Vec<_> = self.entries[offset..end]
            .iter()
            .map(|entry| &entry.public)
            .collect();
        Ok(serde_json::json!({
            "items": items,
            "nextOffset": (end < self.entries.len()).then_some(end),
        }))
    }

    fn target(&self, id: &str) -> Result<&ApplicationTarget, PluginError> {
        self.entries
            .iter()
            .find(|entry| entry.public.id == id)
            .map(|entry| &entry.target)
            .ok_or_else(|| error("apps.unknownItem"))
    }
}

fn checked_catalog<'a>(
    sessions: &'a Sessions,
    caller: &str,
    request: &PluginRequest,
    id: &str,
) -> Result<&'a Catalog, PluginError> {
    let session = sessions.get(&request.session_id, caller, request.generation)?;
    session
        .applications
        .as_ref()
        .filter(|catalog| catalog.id == id && Instant::now() < catalog.expires)
        .ok_or_else(|| error("apps.staleCatalog"))
}

pub(crate) fn dispatch(
    app: &tauri::AppHandle,
    caller: &str,
    request: &PluginRequest,
    method: PluginMethod,
) -> Result<Value, PluginError> {
    match method {
        PluginMethod::ApplicationScan(_) => {
            with_live_capability(app, caller, request, "system.apps", |_| Ok(()))?;
            let gate = app.state::<ApplicationScanGate>();
            let _permit = gate.acquire()?;
            let state = app.state::<WebSessions>();
            let catalog = Catalog::scan(|| {
                state.0.lock().map_or(true, |sessions| {
                    sessions
                        .can_commit(caller, request, Instant::now())
                        .is_err()
                })
            })?;
            let summary = serde_json::json!({
                "catalogId": catalog.id,
                "itemCount": catalog.entries.len(),
            });
            with_live_capability(app, caller, request, "system.apps", |sessions| {
                sessions.publish_applications(request, catalog)?;
                sessions.finish(caller, request, Instant::now())?;
                Ok(summary)
            })
        }
        PluginMethod::ApplicationPage(input) => {
            with_live_capability(app, caller, request, "system.apps", |sessions| {
                let value = checked_catalog(sessions, caller, request, &input.catalog_id)?
                    .page(input.offset)?;
                sessions.finish(caller, request, Instant::now())?;
                Ok(value)
            })
        }
        PluginMethod::ApplicationActivate(input) => {
            let target = with_live_capability(app, caller, request, "system.apps", |sessions| {
                Ok(
                    checked_catalog(sessions, caller, request, &input.catalog_id)?
                        .target(&input.item_id)?
                        .clone(),
                )
            })?;
            if !target.is_current() {
                return Err(error("apps.targetChanged"));
            }
            with_live_capability(app, caller, request, "system.apps", |sessions| {
                checked_catalog(sessions, caller, request, &input.catalog_id)?
                    .target(&input.item_id)?;
                let result = match target.activate() {
                    Ok(Activation::Focused) => Ok(Value::String("focused".into())),
                    Ok(Activation::Launched) => Ok(Value::String("launched".into())),
                    Err(_) => Err(error("apps.activationFailed")),
                };
                sessions.finish(caller, request, Instant::now())?;
                result
            })
        }
        _ => Err(error("request.invalid")),
    }
}
