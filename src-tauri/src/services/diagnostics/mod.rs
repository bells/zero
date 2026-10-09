pub mod contracts;
pub mod events;
pub mod storage;
#[cfg(test)]
mod tests;

use contracts::*;
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fmt,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use storage::{SafeWriter, Storage, WriterHealth};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tracing::{
    field::{Field, Visit},
    Event, Subscriber,
};
use tracing_appender::non_blocking::{ErrorCounter, NonBlockingBuilder, WorkerGuard};
use tracing_subscriber::{
    fmt::{format::Writer, FmtContext, FormatEvent, FormatFields},
    registry::LookupSpan,
};

static GLOBAL: OnceLock<Arc<Diagnostics>> = OnceLock::new();
type Adapter = Arc<dyn Fn() -> Result<HealthSnapshot, DiagnosticsError> + Send + Sync>;
struct PreviewLease {
    caller: String,
    created: Instant,
    preview: DiagnosticsPreview,
}
struct Rate {
    minute: Instant,
    tokens_at: Instant,
    count: u32,
    tokens: f64,
}
struct Memory {
    events: VecDeque<(Instant, DiagnosticEvent)>,
    previews: VecDeque<PreviewLease>,
    verbose_until: Option<Instant>,
    rates: HashMap<String, Rate>,
    preview_generation: u64,
}
pub struct Diagnostics {
    run_id: String,
    memory: Mutex<Memory>,
    adapters: Mutex<HashMap<String, Adapter>>,
    storage: Option<Arc<Mutex<Storage>>>,
    dispatch: Option<tracing::Dispatch>,
    guard: Mutex<Option<WorkerGuard>>,
    queue_errors: Option<ErrorCounter>,
    health: Arc<WriterHealth>,
    epoch: Arc<AtomicU32>,
    closed: AtomicBool,
}
pub fn nonce() -> Result<String, DiagnosticsError> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| DiagnosticsError::new("unavailable"))?;
    Ok(bytes.iter().map(|v| format!("{v:02x}")).collect())
}
pub fn timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown".into())
}
struct JsonFormat;
struct JsonVisitor(Option<String>);
impl Visit for JsonVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "json" {
            self.0 = Some(value.to_owned());
        }
    }
    fn record_debug(&mut self, _: &Field, _: &dyn fmt::Debug) {}
}
impl<S, N> FormatEvent<S, N> for JsonFormat
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        _: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let mut visitor = JsonVisitor(None);
        event.record(&mut visitor);
        if let Some(json) = visitor.0 {
            writeln!(writer, "{json}")?;
        }
        Ok(())
    }
}
impl Diagnostics {
    pub fn new(root: PathBuf) -> Arc<Self> {
        let health = Arc::new(WriterHealth::default());
        let epoch = Arc::new(AtomicU32::new(0));
        let run_id = nonce();
        let storage = run_id.as_ref().ok().and_then(|_| {
            Storage::open(root, epoch.clone(), health.clone())
                .ok()
                .map(|s| Arc::new(Mutex::new(s)))
        });
        let (dispatch, guard, errors) = if let Some(storage) = &storage {
            let (writer, guard) = NonBlockingBuilder::default()
                .buffered_lines_limit(512)
                .lossy(true)
                .finish(SafeWriter(storage.clone()));
            let errors = writer.error_counter();
            let subscriber = tracing_subscriber::fmt()
                .with_ansi(false)
                .event_format(JsonFormat)
                .with_writer(writer)
                .finish();
            (
                Some(tracing::Dispatch::new(subscriber)),
                Some(guard),
                Some(errors),
            )
        } else {
            (None, None, None)
        };
        Arc::new(Self {
            run_id: run_id.unwrap_or_else(|_| "unavailable".into()),
            memory: Mutex::new(Memory {
                events: VecDeque::new(),
                previews: VecDeque::new(),
                verbose_until: None,
                rates: HashMap::new(),
                preview_generation: 0,
            }),
            adapters: Mutex::new(HashMap::new()),
            storage,
            dispatch,
            guard: Mutex::new(guard),
            queue_errors: errors,
            health,
            epoch,
            closed: AtomicBool::new(false),
        })
    }
    pub fn install(self: &Arc<Self>) {
        let _ = GLOBAL.set(self.clone());
    }
    pub fn register(
        &self,
        plugin_id: &str,
        adapter: impl Fn() -> Result<HealthSnapshot, DiagnosticsError> + Send + Sync + 'static,
    ) {
        if events::TOOLS.contains(&plugin_id) {
            if let Ok(mut adapters) = self.adapters.lock() {
                adapters.insert(plugin_id.into(), Arc::new(adapter));
            }
        }
    }
    fn memory(&self) -> Result<std::sync::MutexGuard<'_, Memory>, DiagnosticsError> {
        self.memory
            .lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))
    }
    fn verbose(memory: &Memory, now: Instant) -> bool {
        memory.verbose_until.is_some_and(|until| until > now)
    }
    pub fn status(&self) -> DiagnosticsStatus {
        let remaining = self
            .memory()
            .ok()
            .and_then(|m| m.verbose_until)
            .map_or(0, |until| {
                until
                    .saturating_duration_since(Instant::now())
                    .as_secs()
                    .min(900) as u32
            });
        let dropped = self.health.dropped.load(Ordering::Relaxed).saturating_add(
            self.queue_errors
                .as_ref()
                .map_or(0, |c| c.dropped_lines().min(u32::MAX as usize) as u32),
        );
        DiagnosticsStatus {
            persistence: match self.health.persistence() {
                PersistenceStatus::Healthy if dropped > 0 => PersistenceStatus::Degraded,
                state => state,
            },
            dropped_events: dropped,
            mode: if remaining > 0 {
                Mode::Verbose
            } else {
                Mode::Normal
            },
            verbose_remaining_seconds: remaining,
        }
    }
    pub fn set_mode(&self, mode: Mode) -> Result<DiagnosticsStatus, DiagnosticsError> {
        self.memory()?.verbose_until =
            (mode == Mode::Verbose).then(|| Instant::now() + Duration::from_secs(900));
        Ok(self.status())
    }
    pub fn emit(
        &self,
        source: Source,
        plugin: Option<&str>,
        input: EmitInput,
        metadata: SafeMetadata,
        operation_id: Option<String>,
    ) -> Result<(), DiagnosticsError> {
        if self.closed.load(Ordering::Acquire) {
            return Err(DiagnosticsError::new("unavailable"));
        }
        events::validate(&input)?;
        if metadata
            .http_status
            .is_some_and(|s| !(100..=599).contains(&s))
            || operation_id
                .as_ref()
                .is_some_and(|id| id.len() != 32 || !id.bytes().all(|c| c.is_ascii_hexdigit()))
        {
            return Err(DiagnosticsError::new("invalidInput"));
        }
        if plugin.is_some_and(|id| !events::identifier(id, 128)) {
            return Err(DiagnosticsError::new("invalidInput"));
        }
        let now = Instant::now();
        let mut memory = self.memory()?;
        if matches!(input.level, Level::Debug | Level::Trace) && !Self::verbose(&memory, now) {
            return Err(DiagnosticsError::new("verboseRequired"));
        }
        if source == Source::Extension {
            let id = plugin.ok_or_else(|| DiagnosticsError::new("invalidInput"))?;
            memory
                .rates
                .retain(|_, r| now.duration_since(r.minute) < Duration::from_secs(60));
            if !memory.rates.contains_key(id) && memory.rates.len() >= 64 {
                return Err(DiagnosticsError::new("rateLimited"));
            }
            let rate = memory.rates.entry(id.into()).or_insert(Rate {
                minute: now,
                tokens_at: now,
                count: 0,
                tokens: 10.0,
            });
            rate.tokens =
                (rate.tokens + now.duration_since(rate.tokens_at).as_secs_f64()).min(10.0);
            rate.tokens_at = now;
            if rate.count >= 60 || rate.tokens < 1.0 {
                self.health.loss();
                return Err(DiagnosticsError::new("rateLimited"));
            }
            rate.count += 1;
            rate.tokens -= 1.0;
        }
        if let Some((at, last)) = memory.events.iter_mut().rev().find(|(_, e)| {
            e.source == source
                && e.level == input.level
                && e.operation_id == operation_id
                && e.plugin_id.as_deref() == plugin
                && e.code == input.code
                && e.phase == input.phase
                && e.outcome == input.outcome
        }) {
            if now.duration_since(*at) < Duration::from_secs(10) {
                last.repeat_count = last.repeat_count.saturating_add(1);
                return Ok(());
            }
        }
        let event = DiagnosticEvent {
            schema_version: 1,
            timestamp: timestamp(),
            level: input.level,
            source,
            plugin_id: plugin.map(str::to_owned),
            code: input.code,
            phase: input.phase,
            outcome: input.outcome,
            run_id: self.run_id.clone(),
            operation_id,
            metadata,
            repeat_count: 1,
            storage_epoch: self.epoch.load(Ordering::Acquire),
        };
        let json =
            serde_json::to_string(&event).map_err(|_| DiagnosticsError::new("invalidInput"))?;
        if json.len() + 1 > 4096 {
            return Err(DiagnosticsError::new("invalidInput"));
        }
        if memory.events.len() >= 200 {
            memory.events.pop_front();
        }
        memory.events.push_back((now, event));
        // Keep admission and epoch invalidation ordered; disk IO is on the appender worker.
        if let Some(dispatch) = &self.dispatch {
            tracing::dispatcher::with_default(
                dispatch,
                || tracing::info!(target: "zero::diagnostics", json = json.as_str()),
            );
        }
        Ok(())
    }
    pub fn native(
        &self,
        plugin: Option<&str>,
        phase: &'static str,
        outcome: Outcome,
        metadata: SafeMetadata,
        operation_id: Option<String>,
    ) {
        if !events::native_catalog(plugin, phase) {
            return;
        }
        let _ = self.emit(
            if plugin.is_some() {
                Source::Native
            } else {
                Source::Host
            },
            plugin,
            EmitInput {
                level: if outcome == Outcome::Failed {
                    Level::Warn
                } else {
                    Level::Info
                },
                code: format!("{phase}.result"),
                phase: phase.into(),
                outcome,
            },
            metadata,
            operation_id,
        );
    }
    pub fn revoke_previews(&self, caller: &str) {
        if let Ok(mut m) = self.memory() {
            m.previews.retain(|p| p.caller != caller);
            m.preview_generation = m.preview_generation.wrapping_add(1);
        }
    }
    pub fn copy_text(&self, caller: &str, id: &str) -> Result<String, DiagnosticsError> {
        let mut m = self.memory()?;
        m.previews
            .retain(|p| p.created.elapsed() < Duration::from_secs(300));
        m.previews
            .iter()
            .find(|p| p.caller == caller && p.preview.preview_id == id)
            .map(|p| p.preview.text.clone())
            .ok_or_else(|| DiagnosticsError::new("previewExpired"))
    }
    pub fn clear(&self) -> Result<(), DiagnosticsError> {
        // Hold the sink before invalidating admission; new-epoch records wait behind deletion.
        let mut storage = self
            .storage
            .as_ref()
            .map(|s| s.lock())
            .transpose()
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        {
            let mut memory = self.memory()?;
            self.epoch.fetch_add(1, Ordering::AcqRel);
            memory.events.clear();
            memory.previews.clear();
        }
        if let Some(storage) = storage.as_mut() {
            storage
                .clear()
                .map_err(|_| DiagnosticsError::new("storageFailed"))?;
        }
        Ok(())
    }
    pub fn directory(&self) -> Result<PathBuf, DiagnosticsError> {
        let storage = self
            .storage
            .as_ref()
            .ok_or_else(|| DiagnosticsError::new("storageFailed"))?;
        let storage = storage
            .lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        storage
            .validate_root()
            .map_err(|_| DiagnosticsError::new("storageFailed"))?;
        let meta = std::fs::symlink_metadata(&storage.root)
            .map_err(|_| DiagnosticsError::new("storageFailed"))?;
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(DiagnosticsError::new("storageFailed"));
        }
        Ok(storage.root.clone())
    }
    pub fn shutdown(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        // Adapters own app handles; release them before the application's managed states drop.
        if let Ok(mut adapters) = self.adapters.lock() {
            adapters.clear();
        }
        let guard = self.guard.lock().ok().and_then(|mut g| g.take());
        if let Some(guard) = guard {
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                drop(guard);
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_secs(1));
        }
    }
    pub async fn preview(
        self: &Arc<Self>,
        caller: &str,
        version: &str,
        catalog: Vec<CatalogEntry>,
    ) -> Result<DiagnosticsPreview, DiagnosticsError> {
        let epoch = self.epoch.load(Ordering::Acquire);
        let generation = self.memory()?.preview_generation;
        let began = Instant::now();
        let adapters = self
            .adapters
            .lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))?
            .clone();
        let mut omissions = Vec::new();
        let mut health = Vec::new();
        for plugin in &catalog {
            if !plugin.enabled {
                health.push((
                    plugin.id.clone(),
                    HealthSnapshot::state(HealthState::Disabled),
                ));
                continue;
            }
            if let Some(adapter) = adapters.get(&plugin.id) {
                let adapter = adapter.clone();
                let left = Duration::from_secs(2)
                    .saturating_sub(began.elapsed())
                    .min(Duration::from_millis(200));
                let task = tauri::async_runtime::spawn_blocking(move || adapter());
                match tokio::time::timeout(left, task).await {
                    Ok(Ok(Ok(snapshot))) => health.push((plugin.id.clone(), snapshot)),
                    _ => {
                        omissions.push(format!("{}: snapshot unavailable", plugin.id));
                        health.push((
                            plugin.id.clone(),
                            HealthSnapshot::state(HealthState::Unknown),
                        ));
                    }
                }
            }
        }
        let status = self.status();
        let mut memory = self.memory()?;
        if epoch != self.epoch.load(Ordering::Acquire) || generation != memory.preview_generation {
            return Err(DiagnosticsError::new("previewExpired"));
        }
        let events: Vec<_> = memory
            .events
            .iter()
            .rev()
            .filter(|(_, e)| matches!(e.level, Level::Warn | Level::Error))
            .take(50)
            .map(|(_, e)| e)
            .collect();
        let generated_at = timestamp();
        let mut summary = serde_json::json!({ "schemaVersion": 1, "generatedAt": generated_at, "app": "Zero", "version": version, "platform": std::env::consts::OS, "architecture": std::env::consts::ARCH, "status": status, "plugins": catalog, "health": health, "events": events, "omissions": omissions });
        let mut text = serde_json::to_string_pretty(&summary)
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        let mut truncated = false;
        if text.len() > 65536 {
            truncated = true;
            omissions.push("Recent events omitted to fit summary budget".into());
            summary["events"] = serde_json::json!([]);
            summary["omissions"] = serde_json::json!(omissions);
            text = serde_json::to_string_pretty(&summary)
                .map_err(|_| DiagnosticsError::new("unavailable"))?;
        }
        if text.len() > 65536 {
            return Err(DiagnosticsError::new("unavailable"));
        }
        let preview = DiagnosticsPreview {
            schema_version: 1,
            preview_id: nonce()?,
            generated_at,
            persistence: status.persistence,
            dropped_events: status.dropped_events,
            truncated,
            omissions,
            text,
        };
        memory
            .previews
            .retain(|p| p.created.elapsed() < Duration::from_secs(300));
        while memory.previews.len() >= 2 {
            memory.previews.pop_front();
        }
        memory.previews.push_back(PreviewLease {
            caller: caller.into(),
            created: Instant::now(),
            preview: preview.clone(),
        });
        Ok(preview)
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub version: String,
    pub enabled: bool,
    pub state: String,
}
pub fn native(plugin: Option<&str>, phase: &'static str, outcome: Outcome) {
    if let Some(d) = GLOBAL.get() {
        d.native(plugin, phase, outcome, SafeMetadata::default(), None);
    }
}
pub fn record(
    plugin: Option<&str>,
    phase: &'static str,
    code: &'static str,
    outcome: Outcome,
    metadata: SafeMetadata,
) {
    if events::native_catalog(plugin, phase) {
        if let Some(d) = GLOBAL.get() {
            let _ = d.emit(
                if plugin.is_some() {
                    Source::Native
                } else {
                    Source::Host
                },
                plugin,
                EmitInput {
                    level: if outcome == Outcome::Failed {
                        Level::Warn
                    } else {
                        Level::Info
                    },
                    code: code.into(),
                    phase: phase.into(),
                    outcome,
                },
                metadata,
                None,
            );
        }
    }
}
pub fn safe_version(version: &Option<String>) -> Option<String> {
    version
        .as_ref()
        .filter(|v| {
            v.len() <= 32
                && (semver::Version::parse(v).is_ok()
                    || (!v.is_empty() && v.bytes().all(|c| c.is_ascii_digit() || c == b'.')))
        })
        .cloned()
}
pub fn observe<T, E>(plugin: Option<&str>, phase: &'static str, result: &Result<T, E>) {
    native(
        plugin,
        phase,
        if result.is_ok() {
            Outcome::Succeeded
        } else {
            Outcome::Failed
        },
    );
}
pub struct Operation {
    plugin: Option<&'static str>,
    phase: &'static str,
    id: Option<String>,
    finished: bool,
    began: Instant,
}
impl Operation {
    pub fn new(plugin: Option<&'static str>, phase: &'static str) -> Self {
        let id = nonce().ok();
        if let Some(d) = GLOBAL.get() {
            d.native(
                plugin,
                phase,
                Outcome::Started,
                SafeMetadata::default(),
                id.clone(),
            );
        }
        Self {
            plugin,
            phase,
            id,
            finished: false,
            began: Instant::now(),
        }
    }
    pub fn finish<T, E>(&mut self, result: &Result<T, E>) {
        self.outcome(if result.is_ok() {
            Outcome::Succeeded
        } else {
            Outcome::Failed
        });
    }
    pub fn outcome(&mut self, outcome: Outcome) {
        if let Some(d) = GLOBAL.get() {
            d.native(
                self.plugin,
                self.phase,
                outcome,
                SafeMetadata::default(),
                self.id.clone(),
            );
            if d.status().mode == Mode::Verbose && events::native_catalog(self.plugin, self.phase) {
                let _ = d.emit(
                    if self.plugin.is_some() {
                        Source::Native
                    } else {
                        Source::Host
                    },
                    self.plugin,
                    EmitInput {
                        level: Level::Debug,
                        code: format!("{}.timing", self.phase),
                        phase: self.phase.into(),
                        outcome,
                    },
                    SafeMetadata {
                        duration_ms: Some(
                            self.began.elapsed().as_millis().min(u32::MAX as u128) as u32
                        ),
                        ..Default::default()
                    },
                    self.id.clone(),
                );
            }
        }
        self.finished = true;
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if !self.finished {
            self.outcome(Outcome::Failed);
        }
    }
}
