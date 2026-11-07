use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{Emitter, Manager};

use super::artifacts::{
    cleanup_stale_job_directories, commit_provider_output, create_job_temp_directory,
    remove_job_temp_directory,
};
use super::capabilities::{
    capability_snapshot, default_provider_registry, provider_registry_with_engine,
};
use super::contracts::{
    FileConversionBatchResult, FileConversionCandidate, FileConversionCandidateValidation,
    FileConversionCapabilitySnapshot, FileConversionEnqueueRequest, FileConversionError,
    FileConversionErrorCode, FileConversionJobSnapshot, FileConversionJobState,
    FileConversionProgress, FileConversionResult, FileConversionStage,
};
use super::engine_bridge::FileEngineBridge;
use super::output::reserve_output_path;
use super::provider::{
    FileConversionCancellationToken, FileConversionProgressSink, FileConversionProviderRegistry,
    ProviderConversionRequest, ProviderPlatform,
};
use super::queue::{FileConversionJobDraft, FileConversionJobRecord, FileConversionQueue};
use super::validation::inspect_source;

pub const FILE_CONVERSION_JOB_UPDATED_EVENT: &str = "zero://file-conversion/job-updated";
const MAX_ENQUEUE_ITEMS: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileCapabilityInvalidationCause {
    EngineInstalled,
    EngineUpgraded,
    EngineRepaired,
    EngineRemoved,
    NativeProviderChanged,
    LifecycleReset,
}

struct CapabilityCacheState {
    generation: u64,
    snapshot: Option<FileConversionCapabilitySnapshot>,
    last_invalidation: Option<FileCapabilityInvalidationCause>,
}

impl Default for CapabilityCacheState {
    fn default() -> Self {
        Self {
            generation: 1,
            snapshot: None,
            last_invalidation: None,
        }
    }
}

#[derive(Default)]
struct RuntimeState {
    queue: FileConversionQueue,
    reserved_paths: HashSet<PathBuf>,
    cancellations: HashMap<String, FileConversionCancellationToken>,
    worker_running: bool,
    temp_root: Option<PathBuf>,
    next_job_number: u64,
}

pub struct FileConversionState {
    runtime: Mutex<RuntimeState>,
    enqueue_gate: Mutex<()>,
    providers: Mutex<Option<Arc<FileConversionProviderRegistry>>>,
    capability_cache: Mutex<CapabilityCacheState>,
    preferences: Mutex<(Option<PathBuf>, super::preferences::FileProviderPreferences)>,
    provider_initializations: AtomicU64,
    capability_refreshes: AtomicU64,
}

impl Default for FileConversionState {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(RuntimeState::default()),
            enqueue_gate: Mutex::new(()),
            providers: Mutex::new(None),
            capability_cache: Mutex::new(CapabilityCacheState::default()),
            preferences: Mutex::new((
                None,
                super::preferences::FileProviderPreferences::defaults(ProviderPlatform::current()),
            )),
            provider_initializations: AtomicU64::new(0),
            capability_refreshes: AtomicU64::new(0),
        }
    }
}

impl FileConversionState {
    pub fn diagnostic_health(
        &self,
    ) -> Result<
        crate::services::diagnostics::contracts::HealthSnapshot,
        crate::services::diagnostics::contracts::DiagnosticsError,
    > {
        use super::contracts::{FileConversionProviderAvailability, FileConversionProviderId};
        use crate::services::diagnostics::contracts::*;
        let cache = self
            .capability_cache
            .try_lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        let runtime = self
            .runtime
            .try_lock()
            .map_err(|_| DiagnosticsError::new("unavailable"))?;
        let mut health = HealthSnapshot::state(if runtime.temp_root.is_none() {
            HealthState::NotInitialized
        } else if cache
            .snapshot
            .as_ref()
            .is_some_and(|s| s.directions.iter().any(|d| d.available))
        {
            HealthState::Ready
        } else {
            HealthState::Degraded
        });
        health.metadata.count = Some(runtime.queue.snapshots().len().min(u32::MAX as usize) as u32);
        if let Some(snapshot) = &cache.snapshot {
            for provider in snapshot.directions.iter().flat_map(|d| &d.providers) {
                let id = match provider.id {
                    FileConversionProviderId::ZeroFilePdfToDocx => Provider::ZeroFilePdfToDocx,
                    FileConversionProviderId::ZeroFileDocxToPdfWindows => {
                        Provider::ZeroFileDocxToPdfWindows
                    }
                    FileConversionProviderId::ZeroFileDocxToPdfMacos => {
                        Provider::ZeroFileDocxToPdfMacos
                    }
                    FileConversionProviderId::LibreOffice => Provider::LibreOffice,
                    FileConversionProviderId::MicrosoftWordMacos => Provider::MicrosoftWordMacos,
                    FileConversionProviderId::MicrosoftWordWindows => {
                        Provider::MicrosoftWordWindows
                    }
                };
                health.providers.push(ProviderSnapshot {
                    provider: id,
                    available: matches!(
                        provider.availability,
                        FileConversionProviderAvailability::Available
                    ),
                    version: crate::services::diagnostics::safe_version(&provider.version),
                    engine_version: crate::services::diagnostics::safe_version(
                        &provider.engine_version,
                    ),
                    package_version: crate::services::diagnostics::safe_version(
                        &provider.package_version,
                    ),
                });
            }
        }
        Ok(health)
    }

    pub fn initialize(&self, temp_root: PathBuf) -> Result<(), FileConversionError> {
        self.initialize_registry(default_provider_registry, temp_root)
    }

    pub fn initialize_with_engine(
        &self,
        app: tauri::AppHandle,
        bridge: Arc<FileEngineBridge>,
        temp_root: PathBuf,
    ) -> Result<(), FileConversionError> {
        self.initialize_registry(|| provider_registry_with_engine(app, bridge), temp_root)
    }

    fn initialize_registry(
        &self,
        make_registry: impl FnOnce() -> FileConversionProviderRegistry,
        temp_root: PathBuf,
    ) -> Result<(), FileConversionError> {
        let mut providers = self
            .providers
            .lock()
            .map_err(|_| runtime_error("The File provider registry is unavailable.", true))?;
        if providers.is_some() {
            return Ok(());
        }
        cleanup_stale_job_directories(&temp_root)?;
        let registry = Arc::new(make_registry());
        self.lock_runtime()?.temp_root = Some(temp_root);
        *providers = Some(registry);
        self.provider_initializations
            .fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    pub fn configure_preferences(&self, path: PathBuf) -> Result<(), FileConversionError> {
        let mut preferences = self
            .preferences
            .lock()
            .map_err(|_| runtime_error("File preferences are unavailable.", true))?;
        if preferences.0.is_none() {
            let loaded = super::preferences::load(&path, ProviderPlatform::current())?;
            *preferences = (Some(path), loaded);
        }
        Ok(())
    }

    pub fn set_provider(
        &self,
        request: super::contracts::FileConversionProviderSelectionRequest,
    ) -> Result<FileConversionCapabilitySnapshot, FileConversionError> {
        let mut preferences = self
            .preferences
            .lock()
            .map_err(|_| runtime_error("File preferences are unavailable.", true))?;
        let next = preferences.1.replace(
            request.direction,
            request.provider_id,
            request.expected_revision,
            ProviderPlatform::current(),
        )?;
        let path = preferences
            .0
            .as_ref()
            .ok_or_else(|| runtime_error("File preferences have not been initialized.", true))?;
        super::preferences::save(path, &next)?;
        preferences.1 = next;
        let mut snapshot = self.raw_capabilities();
        super::capabilities::apply_preferences(&mut snapshot, &preferences.1);
        Ok(snapshot)
    }

    pub fn capabilities(&self) -> FileConversionCapabilitySnapshot {
        let mut snapshot = self.raw_capabilities();
        if let Ok(preferences) = self.preferences.lock() {
            super::capabilities::apply_preferences(&mut snapshot, &preferences.1);
        }
        snapshot
    }

    fn raw_capabilities(&self) -> FileConversionCapabilitySnapshot {
        loop {
            let generation = self.capability_generation();
            if let Ok(cache) = self.capability_cache.lock() {
                if cache.generation == generation {
                    if let Some(snapshot) = &cache.snapshot {
                        return snapshot.clone();
                    }
                }
            }
            let providers = self
                .providers
                .lock()
                .ok()
                .and_then(|providers| providers.as_ref().map(Arc::clone))
                .unwrap_or_else(|| Arc::new(FileConversionProviderRegistry::new(Vec::new())));
            let mut snapshot =
                capability_snapshot(&providers, ProviderPlatform::current(), now_ms());
            snapshot.capability_revision = generation;
            let Ok(mut cache) = self.capability_cache.lock() else {
                return snapshot;
            };
            if cache.generation != generation {
                continue;
            }
            cache.snapshot = Some(snapshot.clone());
            self.capability_refreshes.fetch_add(1, Ordering::Relaxed);
            return snapshot;
        }
    }

    pub fn invalidate_capabilities(&self, cause: FileCapabilityInvalidationCause) -> u64 {
        if let Ok(providers) = self.providers.lock() {
            if let Some(providers) = providers.as_ref() {
                providers.invalidate();
            }
        }
        let mut cache = match self.capability_cache.lock() {
            Ok(cache) => cache,
            Err(poisoned) => poisoned.into_inner(),
        };
        cache.generation = cache.generation.saturating_add(1);
        cache.snapshot = None;
        cache.last_invalidation = Some(cause);
        cache.generation
    }

    pub fn capability_generation(&self) -> u64 {
        self.capability_cache
            .lock()
            .map(|cache| cache.generation)
            .unwrap_or_default()
    }

    pub fn capability_refresh_count(&self) -> u64 {
        self.capability_refreshes.load(Ordering::Relaxed)
    }

    pub fn provider_initialization_count(&self) -> u64 {
        self.provider_initializations.load(Ordering::Relaxed)
    }

    pub fn inspect_paths(&self, source_paths: Vec<String>) -> Vec<FileConversionCandidate> {
        let mut active_sources = self
            .runtime
            .lock()
            .map(|runtime| runtime.queue.active_sources())
            .unwrap_or_default();
        source_paths
            .into_iter()
            .map(|source_path| {
                let candidate = inspect_source(Path::new(&source_path), &active_sources);
                if matches!(
                    candidate.validation,
                    FileConversionCandidateValidation::Valid { .. }
                ) {
                    active_sources.insert(PathBuf::from(&candidate.source_path));
                }
                candidate
            })
            .collect()
    }

    pub fn enqueue(
        &self,
        request: FileConversionEnqueueRequest,
    ) -> Result<FileConversionBatchResult, FileConversionError> {
        let mut diagnostic =
            crate::services::diagnostics::Operation::new(Some("zero.file"), "validate");
        let result = (|| {
            if request.items.is_empty() || request.items.len() > MAX_ENQUEUE_ITEMS {
                return Err(FileConversionError {
                    code: FileConversionErrorCode::InvalidInput,
                    message: "A conversion batch must contain between 1 and 100 files.".into(),
                    retryable: false,
                    provider_id: None,
                    diagnostic: None,
                    quality_issues: Vec::new(),
                });
            }
            let _enqueue = self
                .enqueue_gate
                .lock()
                .map_err(|_| runtime_error("The File enqueue coordinator is unavailable.", true))?;
            let (mut active_sources, mut reserved_paths) = {
                let runtime = self.lock_runtime()?;
                (
                    runtime.queue.active_sources(),
                    runtime.reserved_paths.clone(),
                )
            };
            let mut prepared = Vec::new();
            let mut rejected_candidates = Vec::new();

            for item in request.items {
                let candidate = inspect_source(Path::new(&item.source_path), &active_sources);
                let direction = match &candidate.validation {
                    FileConversionCandidateValidation::Valid { direction, .. } => *direction,
                    FileConversionCandidateValidation::Rejected { .. } => {
                        rejected_candidates.push(candidate);
                        continue;
                    }
                };
                let canonical_source = PathBuf::from(&candidate.source_path);
                let reservation = match reserve_output_path(
                    &canonical_source,
                    direction,
                    item.output_directory.as_deref().map(Path::new),
                    &mut reserved_paths,
                ) {
                    Ok(reservation) => reservation,
                    Err(error) => {
                        rejected_candidates.push(rejected_from_candidate(candidate, error));
                        continue;
                    }
                };
                active_sources.insert(canonical_source.clone());
                prepared.push((candidate, canonical_source, direction, reservation));
            }

            let mut runtime = self.lock_runtime()?;
            let mut jobs = Vec::new();
            for (candidate, canonical_source, direction, reservation) in prepared {
                runtime.next_job_number += 1;
                let draft = FileConversionJobDraft {
                    id: format!("file-{}-{}", now_ms(), runtime.next_job_number),
                    canonical_source: canonical_source.clone(),
                    final_output: reservation.output_path.clone(),
                    source_name: candidate.source_name.clone(),
                    size_bytes: candidate.size_bytes.unwrap_or(0),
                    direction,
                    target_name: reservation.output_name,
                };
                match runtime.queue.enqueue(draft, now_ms()) {
                    Ok(snapshot) => {
                        runtime.reserved_paths.insert(reservation.output_path);
                        jobs.push(snapshot);
                    }
                    Err(error) => {
                        rejected_candidates.push(rejected_from_candidate(candidate, error));
                    }
                }
            }

            Ok(FileConversionBatchResult {
                jobs,
                rejected_candidates,
            })
        })();
        diagnostic.finish(&result);
        result
    }

    pub fn queue_snapshot(
        &self,
    ) -> Result<super::contracts::FileConversionQueueSnapshot, FileConversionError> {
        Ok(self.lock_runtime()?.queue.queue_snapshot())
    }

    pub fn snapshots(&self) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        Ok(self.lock_runtime()?.queue.snapshots())
    }

    pub fn start(&self) -> Result<(Vec<FileConversionJobSnapshot>, bool), FileConversionError> {
        let preferences = self
            .preferences
            .lock()
            .map_err(|_| runtime_error("File preferences are unavailable.", true))?;
        let (mut capabilities, _capability_guard) = loop {
            let snapshot = self.raw_capabilities();
            let cache = self
                .capability_cache
                .lock()
                .map_err(|_| runtime_error("File capabilities are unavailable.", true))?;
            if snapshot.capability_revision == cache.generation {
                break (snapshot, cache);
            }
        };
        super::capabilities::apply_preferences(&mut capabilities, &preferences.1);
        let mut runtime = self.lock_runtime()?;
        if runtime.temp_root.is_none() {
            return Err(runtime_error(
                "The File conversion workspace has not been initialized.",
                true,
            ));
        }
        let mut updates = runtime.queue.bind_pending(&capabilities, now_ms());
        let started = runtime.queue.start_bound(&capabilities, now_ms());
        if let Some(snapshot) = &started {
            runtime
                .cancellations
                .entry(snapshot.id.clone())
                .or_default();
            updates.retain(|update| update.id != snapshot.id);
            updates.push(snapshot.clone());
        }
        let should_spawn = runtime.queue.active_job_id().is_some() && !runtime.worker_running;
        if should_spawn {
            runtime.worker_running = true;
        }
        Ok((updates, should_spawn))
    }

    pub fn cancel(
        &self,
        job_id: &str,
    ) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        let mut diagnostic =
            crate::services::diagnostics::Operation::new(Some("zero.file"), "cancel");
        let result = (|| {
            let mut runtime = self.lock_runtime()?;
            if runtime.queue.active_job_id() == Some(job_id) {
                runtime
                    .cancellations
                    .entry(job_id.to_string())
                    .or_default()
                    .cancel();
                return runtime
                    .queue
                    .record(job_id)
                    .map(|record| vec![record.snapshot.clone()])
                    .ok_or_else(unknown_job);
            }
            runtime.queue.cancel(job_id, now_ms())
        })();
        diagnostic.outcome(if result.is_ok() {
            crate::services::diagnostics::contracts::Outcome::Cancelled
        } else {
            crate::services::diagnostics::contracts::Outcome::Failed
        });
        result
    }

    pub fn remove(&self, job_id: &str) -> Result<FileConversionJobSnapshot, FileConversionError> {
        let mut runtime = self.lock_runtime()?;
        let final_output = runtime
            .queue
            .record(job_id)
            .map(|record| record.final_output.clone())
            .ok_or_else(unknown_job)?;
        let removed = runtime.queue.remove(job_id)?;
        runtime.reserved_paths.remove(&final_output);
        runtime.cancellations.remove(job_id);
        Ok(removed)
    }

    pub fn retry(&self, job_id: &str) -> Result<FileConversionJobSnapshot, FileConversionError> {
        self.retry_with_provider(job_id, None)
    }

    pub fn retry_with_provider(
        &self,
        job_id: &str,
        provider_id: Option<super::contracts::FileConversionProviderId>,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        let _enqueue = self
            .enqueue_gate
            .lock()
            .map_err(|_| runtime_error("The File enqueue coordinator is unavailable.", true))?;
        let (record, active_sources) = {
            let runtime = self.lock_runtime()?;
            (
                runtime
                    .queue
                    .record(job_id)
                    .cloned()
                    .ok_or_else(unknown_job)?,
                runtime.queue.active_sources(),
            )
        };
        let candidate = inspect_source(&record.canonical_source, &active_sources);
        let direction = match candidate.validation {
            FileConversionCandidateValidation::Valid { direction, .. }
                if direction == record.snapshot.direction =>
            {
                direction
            }
            FileConversionCandidateValidation::Rejected { error } => return Err(error),
            _ => {
                return Err(super::provider::provider_error(
                    FileConversionErrorCode::InvalidInput,
                    "The source no longer matches the queued conversion direction.",
                    false,
                    provider_id,
                ))
            }
        };
        let capabilities = self.raw_capabilities();
        let mut runtime = self.lock_runtime()?;
        let current = runtime.queue.record(job_id).ok_or_else(unknown_job)?;
        if current.snapshot.revision != record.snapshot.revision {
            return Err(runtime_error(
                "The job changed while its input was being checked. Try again.",
                true,
            ));
        }
        if let Some(id) = provider_id {
            let provider = capabilities
                .directions
                .iter()
                .find(|entry| entry.direction == direction)
                .and_then(|entry| entry.providers.iter().find(|provider| provider.id == id));
            if !provider.is_some_and(|provider| {
                matches!(
                    provider.availability,
                    super::contracts::FileConversionProviderAvailability::Available
                )
            }) {
                return Err(super::provider::provider_error(
                    FileConversionErrorCode::EngineUnavailable,
                    "Choose an available provider for this direction.",
                    true,
                    Some(id),
                ));
            }
        }
        let snapshot = runtime.queue.retry(job_id, now_ms())?;
        if let Some(id) = provider_id {
            runtime.queue.bind_retry(job_id, id)
        } else {
            Ok(snapshot)
        }
    }

    pub fn clear_completed(&self) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        let mut runtime = self.lock_runtime()?;
        let completed = runtime
            .queue
            .snapshots()
            .into_iter()
            .filter(|job| matches!(job.state, FileConversionJobState::Completed { .. }))
            .collect::<Vec<_>>();
        for job in &completed {
            if let Some(record) = runtime.queue.record(&job.id) {
                let final_output = record.final_output.clone();
                runtime.reserved_paths.remove(&final_output);
            }
            runtime.cancellations.remove(&job.id);
        }
        Ok(runtime.queue.clear_completed())
    }

    pub(crate) fn completed_record(
        &self,
        job_id: &str,
    ) -> Result<FileConversionJobRecord, FileConversionError> {
        self.lock_runtime()?
            .queue
            .record(job_id)
            .cloned()
            .ok_or_else(unknown_job)
    }

    pub fn shutdown_cleanup(&self) {
        let temp_root = if let Ok(runtime) = self.runtime.lock() {
            for cancellation in runtime.cancellations.values() {
                cancellation.cancel();
            }
            runtime.temp_root.clone()
        } else {
            None
        };
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            let worker_running = self
                .runtime
                .lock()
                .map(|runtime| runtime.worker_running)
                .unwrap_or(false);
            if !worker_running {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        if let Some(temp_root) = temp_root {
            let worker_running = self
                .runtime
                .lock()
                .map(|runtime| runtime.worker_running)
                .unwrap_or(true);
            if !worker_running {
                let _ = cleanup_stale_job_directories(&temp_root);
            }
        }
    }

    fn lock_runtime(&self) -> Result<std::sync::MutexGuard<'_, RuntimeState>, FileConversionError> {
        self.runtime.lock().map_err(|_| {
            runtime_error(
                "The File conversion queue is temporarily unavailable.",
                true,
            )
        })
    }
}

pub async fn run_file_conversion_worker(app: tauri::AppHandle) {
    loop {
        let active = {
            let state = app.state::<FileConversionState>();
            let Ok(mut runtime) = state.lock_runtime() else {
                return;
            };
            let Some(job_id) = runtime.queue.active_job_id().map(str::to_string) else {
                runtime.worker_running = false;
                drop(runtime);
                let bridge = Arc::clone(
                    &app.state::<super::engine_bridge::FileEngineBridgeState>()
                        .bridge,
                );
                bridge.schedule_idle_teardown(&app);
                return;
            };
            let Some(record) = runtime.queue.record(&job_id).cloned() else {
                runtime.worker_running = false;
                return;
            };
            let cancellation = runtime.cancellations.entry(job_id).or_default().clone();
            let Some(temp_root) = runtime.temp_root.clone() else {
                runtime.worker_running = false;
                return;
            };
            (record, cancellation, temp_root)
        };
        execute_active_job(&app, active.0, active.1, active.2).await;
    }
}

async fn execute_active_job(
    app: &tauri::AppHandle,
    record: FileConversionJobRecord,
    cancellation: FileConversionCancellationToken,
    temp_root: PathBuf,
) {
    let state = app.state::<FileConversionState>();
    if let Ok(snapshot) = state.lock_runtime().and_then(|mut runtime| {
        runtime.queue.set_preparing_stage(
            &record.snapshot.id,
            FileConversionStage::WaitingForProvider,
            now_ms(),
        )
    }) {
        emit_snapshot(app, &snapshot);
    }
    if cancellation.is_cancelled() {
        finish_with_error(app, &record.snapshot.id, cancelled_error());
        return;
    }

    let providers = match state.providers.lock() {
        Ok(providers) => providers.as_ref().map(Arc::clone),
        Err(_) => {
            finish_with_error(
                app,
                &record.snapshot.id,
                runtime_error("The File provider registry is unavailable.", true),
            );
            return;
        }
    };
    let Some(providers) = providers else {
        finish_with_error(
            app,
            &record.snapshot.id,
            runtime_error("The File provider registry has not been initialized.", true),
        );
        return;
    };
    let provider = match record
        .snapshot
        .provider_id
        .ok_or_else(|| runtime_error("The job has no bound provider.", false))
        .and_then(|id| {
            providers.select_id(record.snapshot.direction, ProviderPlatform::current(), id)
        }) {
        Ok(provider) => provider,
        Err(error) => {
            finish_with_error(app, &record.snapshot.id, error);
            return;
        }
    };
    let job_directory = match create_job_temp_directory(&temp_root, &record.snapshot.id) {
        Ok(directory) => directory,
        Err(error) => {
            finish_with_error(app, &record.snapshot.id, error);
            return;
        }
    };
    match state.lock_runtime().and_then(|mut runtime| {
        runtime.queue.mark_running(
            &record.snapshot.id,
            provider.id(),
            FileConversionProgress::Indeterminate {
                stage: FileConversionStage::Converting,
            },
            now_ms(),
        )
    }) {
        Ok(snapshot) => emit_snapshot(app, &snapshot),
        Err(error) => {
            let _ = remove_job_temp_directory(&temp_root, &job_directory);
            finish_with_error(app, &record.snapshot.id, error);
            return;
        }
    }

    let progress_sink = RuntimeProgressSink {
        app: app.clone(),
        job_id: record.snapshot.id.clone(),
    };
    let request = ProviderConversionRequest {
        job_id: record.snapshot.id.clone(),
        direction: record.snapshot.direction,
        source_path: record.canonical_source.clone(),
        temp_directory: job_directory.clone(),
    };
    let provider_id = provider.id();
    let provider_result = tauri::async_runtime::spawn_blocking(move || {
        provider.convert(&request, &progress_sink, &cancellation)
    })
    .await
    .map_err(|_| runtime_error("The local conversion worker stopped unexpectedly.", true))
    .and_then(|result| result);

    let final_result = provider_result.and_then(|output| {
        if provider_id == super::contracts::FileConversionProviderId::ZeroFilePdfToDocx {
            super::editable_output::commit_editable_docx(
                &job_directory,
                &output.path,
                &record.final_output,
                &record.snapshot.id,
            )?;
        } else {
            commit_provider_output(
                &job_directory,
                &output.path,
                &record.final_output,
                record.snapshot.direction,
                &record.snapshot.id,
            )?;
        }
        let metadata = std::fs::metadata(&record.final_output)
            .map_err(|_| runtime_error("The completed output could not be revalidated.", true))?;
        Ok(FileConversionResult {
            output_path: record.final_output.to_string_lossy().into_owned(),
            output_name: record.snapshot.target_name.clone(),
            size_bytes: metadata.len(),
            completed_at_ms: now_ms(),
            provider_id,
            provider_origin: output.provider_origin,
            engine_version: output.engine_version,
            quality_profile: output.quality_profile,
            warning_keys: output.warning_keys,
            quality_issues: output.quality_issues,
            page_count: output.page_count,
        })
    });
    let _ = remove_job_temp_directory(&temp_root, &job_directory);

    let outcome = match &final_result {
        Ok(_) => crate::services::diagnostics::contracts::Outcome::Succeeded,
        Err(error) if error.code == FileConversionErrorCode::Cancelled => {
            crate::services::diagnostics::contracts::Outcome::Cancelled
        }
        Err(_) => crate::services::diagnostics::contracts::Outcome::Failed,
    };
    if final_result.is_ok() {
        crate::services::diagnostics::native(Some("zero.file"), "execute", outcome);
    }
    match final_result {
        Ok(result) => finish_completed(app, &record.snapshot.id, result),
        Err(error) => finish_with_error(app, &record.snapshot.id, error),
    }
}

struct RuntimeProgressSink {
    app: tauri::AppHandle,
    job_id: String,
}

impl FileConversionProgressSink for RuntimeProgressSink {
    fn report(&self, progress: FileConversionProgress) -> Result<(), FileConversionError> {
        let snapshot = self
            .app
            .state::<FileConversionState>()
            .lock_runtime()?
            .queue
            .update_progress(&self.job_id, progress, now_ms())?;
        emit_snapshot(&self.app, &snapshot);
        Ok(())
    }
}

fn finish_completed(app: &tauri::AppHandle, job_id: &str, result: FileConversionResult) {
    let state = app.state::<FileConversionState>();
    if let Ok(updates) = state.lock_runtime().and_then(|mut runtime| {
        runtime.cancellations.remove(job_id);
        let updates = runtime.queue.complete(job_id, result, now_ms())?;
        register_next_cancellation(&mut runtime, &updates);
        Ok(updates)
    }) {
        updates.iter().for_each(|update| emit_snapshot(app, update));
    }
}

fn finish_with_error(app: &tauri::AppHandle, job_id: &str, error: FileConversionError) {
    super::errors::record_diagnostic_error(&error);
    let state = app.state::<FileConversionState>();
    if let Ok(updates) = state.lock_runtime().and_then(|mut runtime| {
        runtime.cancellations.remove(job_id);
        let updates = if error.code == FileConversionErrorCode::Cancelled {
            runtime.queue.cancel(job_id, now_ms())?
        } else {
            runtime.queue.fail(job_id, error, now_ms())?
        };
        register_next_cancellation(&mut runtime, &updates);
        Ok(updates)
    }) {
        updates.iter().for_each(|update| emit_snapshot(app, update));
    }
}

fn register_next_cancellation(runtime: &mut RuntimeState, updates: &[FileConversionJobSnapshot]) {
    for update in updates {
        if matches!(update.state, FileConversionJobState::Preparing { .. }) {
            runtime.cancellations.entry(update.id.clone()).or_default();
        }
    }
}

fn emit_snapshot(app: &tauri::AppHandle, snapshot: &FileConversionJobSnapshot) {
    let _ = app.emit(FILE_CONVERSION_JOB_UPDATED_EVENT, snapshot.clone());
}

fn rejected_from_candidate(
    candidate: FileConversionCandidate,
    error: FileConversionError,
) -> FileConversionCandidate {
    FileConversionCandidate {
        validation: FileConversionCandidateValidation::Rejected { error },
        ..candidate
    }
}

fn cancelled_error() -> FileConversionError {
    FileConversionError {
        code: FileConversionErrorCode::Cancelled,
        message: "The conversion was cancelled.".into(),
        retryable: true,
        provider_id: None,
        diagnostic: None,
        quality_issues: Vec::new(),
    }
}

fn unknown_job() -> FileConversionError {
    FileConversionError {
        code: FileConversionErrorCode::UnknownJob,
        message: "The conversion job was not found.".into(),
        retryable: false,
        provider_id: None,
        diagnostic: None,
        quality_issues: Vec::new(),
    }
}

fn runtime_error(message: &str, retryable: bool) -> FileConversionError {
    FileConversionError {
        code: FileConversionErrorCode::Internal,
        message: message.into(),
        retryable,
        provider_id: None,
        diagnostic: None,
        quality_issues: Vec::new(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::services::file::contracts::{
        FileConversionEnqueueItem, FileConversionEnqueueRequest,
    };

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "zero-file-runtime-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .expect("clock")
                    .as_nanos()
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn mixed_enqueue_keeps_valid_jobs_and_returns_inline_rejections_without_starting() {
        let root = TestRoot::new();
        let valid = root.0.join("report.pdf");
        let unsupported = root.0.join("legacy.doc");
        fs::write(&valid, b"%PDF-1.7\nfixture").unwrap();
        fs::write(&unsupported, b"fixture").unwrap();
        let state = FileConversionState::default();
        state.initialize(root.0.join("temp")).unwrap();

        let result = state
            .enqueue(FileConversionEnqueueRequest {
                items: vec![
                    FileConversionEnqueueItem {
                        source_path: valid.to_string_lossy().into_owned(),
                        output_directory: None,
                    },
                    FileConversionEnqueueItem {
                        source_path: unsupported.to_string_lossy().into_owned(),
                        output_directory: None,
                    },
                ],
            })
            .unwrap();

        assert_eq!(result.jobs.len(), 1);
        assert_eq!(result.rejected_candidates.len(), 1);
        assert!(matches!(
            result.jobs[0].state,
            FileConversionJobState::Queued
        ));
        assert!(state
            .lock_runtime()
            .unwrap()
            .queue
            .active_job_id()
            .is_none());
    }

    #[test]
    fn concurrent_enqueues_publish_unique_jobs_without_holding_runtime_during_inspection() {
        let root = TestRoot::new();
        let sources = [
            root.0.join("first-race.pdf"),
            root.0.join("second-race.pdf"),
        ];
        for source in &sources {
            fs::write(source, b"%PDF-1.7\nfixture").unwrap();
        }
        let state = Arc::new(FileConversionState::default());
        state.initialize(root.0.join("temp")).unwrap();
        let workers = sources.map(|source| {
            let state = Arc::clone(&state);
            std::thread::spawn(move || {
                state
                    .enqueue(FileConversionEnqueueRequest {
                        items: vec![FileConversionEnqueueItem {
                            source_path: source.to_string_lossy().into_owned(),
                            output_directory: None,
                        }],
                    })
                    .unwrap()
            })
        });
        let results = workers.map(|worker| worker.join().unwrap());
        assert!(results.iter().all(|result| result.jobs.len() == 1));
        let snapshots = state.snapshots().unwrap();
        assert_eq!(snapshots.len(), 2);
        assert_ne!(snapshots[0].id, snapshots[1].id);
    }

    #[test]
    fn explicit_start_and_job_scoped_actions_use_the_authoritative_queue() {
        let root = TestRoot::new();
        let first = root.0.join("first.pdf");
        let second = root.0.join("second.pdf");
        fs::write(&first, b"%PDF-1.7\nfixture").unwrap();
        fs::write(&second, b"%PDF-1.7\nfixture").unwrap();
        let state = FileConversionState::default();
        state.initialize(root.0.join("temp")).unwrap();
        let result = state
            .enqueue(FileConversionEnqueueRequest {
                items: [first, second]
                    .into_iter()
                    .map(|path| FileConversionEnqueueItem {
                        source_path: path.to_string_lossy().into_owned(),
                        output_directory: None,
                    })
                    .collect(),
            })
            .unwrap();
        let queued_second = result.jobs[1].id.clone();

        let mut capabilities = state.raw_capabilities();
        capabilities.directions[0].providers[0].availability =
            super::super::contracts::FileConversionProviderAvailability::Available;
        state.capability_cache.lock().unwrap().snapshot = Some(capabilities);
        let (updates, should_spawn) = state.start().unwrap();
        assert!(should_spawn);
        assert_eq!(updates.len(), 2);
        assert_eq!(
            updates
                .iter()
                .filter(|job| matches!(job.state, FileConversionJobState::Preparing { .. }))
                .count(),
            1
        );
        assert!(updates.iter().all(|job| job.provider_id
            == Some(super::super::contracts::FileConversionProviderId::ZeroFilePdfToDocx)));

        let cancelled = state.cancel(&queued_second).unwrap();
        assert!(matches!(
            cancelled[0].state,
            FileConversionJobState::Cancelled { .. }
        ));
        state.remove(&queued_second).unwrap();
        assert_eq!(state.snapshots().unwrap().len(), 1);
    }

    #[test]
    fn retry_revalidates_source_before_rebinding_and_preserves_failed_state() {
        use super::super::contracts::FileConversionProviderId;
        let root = TestRoot::new();
        let source = root.0.join("source.pdf");
        fs::write(&source, b"%PDF-1.7\nfixture").unwrap();
        let state = FileConversionState::default();
        state.initialize(root.0.join("temp")).unwrap();
        let batch = state
            .enqueue(FileConversionEnqueueRequest {
                items: vec![FileConversionEnqueueItem {
                    source_path: source.to_string_lossy().into_owned(),
                    output_directory: None,
                }],
            })
            .unwrap();
        let job_id = &batch.jobs[0].id;
        state.cancel(job_id).unwrap();
        let mut capabilities = state.raw_capabilities();
        capabilities.directions[0].providers[0].availability =
            super::super::contracts::FileConversionProviderAvailability::Available;
        state.capability_cache.lock().unwrap().snapshot = Some(capabilities);
        fs::write(&source, b"%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj").unwrap();
        assert_eq!(
            state
                .retry_with_provider(job_id, Some(FileConversionProviderId::ZeroFilePdfToDocx))
                .unwrap_err()
                .code,
            FileConversionErrorCode::PasswordRequired
        );
        assert!(matches!(
            state.snapshots().unwrap()[0].state,
            FileConversionJobState::Cancelled { .. }
        ));
        assert_eq!(state.snapshots().unwrap()[0].provider_id, None);
    }

    #[test]
    fn concurrent_windows_cannot_save_different_choices_at_the_same_revision() {
        use super::super::contracts::{
            FileConversionDirection, FileConversionProviderId,
            FileConversionProviderSelectionRequest,
        };
        let root = TestRoot::new();
        let platform = ProviderPlatform::current();
        let Some(default) = super::super::preferences::default_provider(
            FileConversionDirection::DocxToPdf,
            platform,
        ) else {
            return;
        };
        let path = root.0.join("preferences.json");
        let state = Arc::new(FileConversionState::default());
        state.configure_preferences(path.clone()).unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let workers = [default, FileConversionProviderId::LibreOffice].map(|provider_id| {
            let state = Arc::clone(&state);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                state.set_provider(FileConversionProviderSelectionRequest {
                    direction: FileConversionDirection::DocxToPdf,
                    provider_id,
                    expected_revision: 0,
                })
            })
        });
        let results = workers.map(|worker| worker.join().unwrap());
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| result
                    .as_ref()
                    .is_err_and(|error| error.code == FileConversionErrorCode::InvalidJobState))
                .count(),
            1
        );
        let current = state.capabilities();
        let persisted = super::super::preferences::load(&path, platform).unwrap();
        assert_eq!(current.preference_revision, 1);
        assert_eq!(persisted.revision, 1);
        assert_eq!(
            current.directions[1].preferred_provider_id,
            persisted.docx_to_pdf
        );
    }

    #[test]
    fn preference_save_failure_preserves_authoritative_revision_and_choice() {
        use super::super::contracts::{
            FileConversionDirection, FileConversionProviderId,
            FileConversionProviderSelectionRequest,
        };
        let root = TestRoot::new();
        let state = FileConversionState::default();
        let path = root.0.join("settings.json");
        state.configure_preferences(path.clone()).unwrap();
        let selected = super::super::preferences::default_provider(
            FileConversionDirection::DocxToPdf,
            ProviderPlatform::current(),
        );
        let Some(selected) = selected else {
            return;
        };
        fs::create_dir(&path).unwrap();
        assert!(state
            .set_provider(FileConversionProviderSelectionRequest {
                direction: FileConversionDirection::DocxToPdf,
                provider_id: FileConversionProviderId::LibreOffice,
                expected_revision: 0
            })
            .is_err());
        let snapshot = state.capabilities();
        assert_eq!(snapshot.preference_revision, 0);
        assert_eq!(snapshot.directions[1].preferred_provider_id, Some(selected));
        fs::remove_dir(&path).unwrap();
        let changed = state
            .set_provider(FileConversionProviderSelectionRequest {
                direction: FileConversionDirection::DocxToPdf,
                provider_id: FileConversionProviderId::LibreOffice,
                expected_revision: 0,
            })
            .unwrap();
        assert_eq!(changed.preference_revision, 1);
        assert!(state
            .set_provider(FileConversionProviderSelectionRequest {
                direction: FileConversionDirection::DocxToPdf,
                provider_id: selected,
                expected_revision: 0
            })
            .is_err());
        assert_eq!(
            state.capabilities().directions[1].preferred_provider_id,
            Some(FileConversionProviderId::LibreOffice)
        );
        let restarted = FileConversionState::default();
        restarted.configure_preferences(path).unwrap();
        assert_eq!(restarted.capabilities().preference_revision, 1);
        assert_eq!(
            restarted.capabilities().directions[1].preferred_provider_id,
            Some(FileConversionProviderId::LibreOffice)
        );
        assert!(restarted.snapshots().unwrap().is_empty());
    }

    #[test]
    fn a_new_runtime_has_no_persisted_job_history() {
        let state = FileConversionState::default();
        assert_eq!(state.provider_initialization_count(), 0);
        assert!(state.snapshots().unwrap().is_empty());
        assert_eq!(
            state.remove("missing").unwrap_err().code,
            FileConversionErrorCode::UnknownJob
        );
        assert_eq!(
            state.cancel("missing").unwrap_err().code,
            FileConversionErrorCode::UnknownJob
        );
    }

    #[test]
    fn provider_registry_initializes_once_for_repeated_requests() {
        let root = TestRoot::new();
        let state = FileConversionState::default();
        state.initialize(root.0.join("temp")).unwrap();
        state.initialize(root.0.join("different-temp")).unwrap();

        assert_eq!(state.provider_initialization_count(), 1);
        let first = state.capabilities();
        let second = state.capabilities();
        assert!(!first.directions.is_empty());
        assert_eq!(first, second);
        assert_eq!(state.capability_refresh_count(), 1);
    }

    #[test]
    fn every_supported_cause_advances_generation_and_rebuilds_once_on_demand() {
        let root = TestRoot::new();
        let state = FileConversionState::default();
        state.initialize(root.0.join("temp")).unwrap();
        let _ = state.capabilities();
        let causes = [
            FileCapabilityInvalidationCause::EngineInstalled,
            FileCapabilityInvalidationCause::EngineUpgraded,
            FileCapabilityInvalidationCause::EngineRepaired,
            FileCapabilityInvalidationCause::EngineRemoved,
            FileCapabilityInvalidationCause::NativeProviderChanged,
            FileCapabilityInvalidationCause::LifecycleReset,
        ];
        let mut generation = state.capability_generation();
        for (index, cause) in causes.into_iter().enumerate() {
            let next_generation = state.invalidate_capabilities(cause);
            assert_eq!(next_generation, generation + 1);
            generation = next_generation;
            let _ = state.capabilities();
            let _ = state.capabilities();
            assert_eq!(state.capability_refresh_count(), index as u64 + 2);
        }
    }

    #[test]
    fn rejects_empty_and_unbounded_batches_before_touching_the_queue() {
        let state = FileConversionState::default();
        for count in [0, MAX_ENQUEUE_ITEMS + 1] {
            let error = state
                .enqueue(FileConversionEnqueueRequest {
                    items: (0..count)
                        .map(|index| FileConversionEnqueueItem {
                            source_path: format!("/tmp/{index}.pdf"),
                            output_directory: None,
                        })
                        .collect(),
                })
                .unwrap_err();
            assert_eq!(error.code, FileConversionErrorCode::InvalidInput);
        }
        assert!(state.snapshots().unwrap().is_empty());
    }

    #[test]
    fn shutdown_cleanup_removes_only_zero_owned_stale_workspaces() {
        let root = TestRoot::new();
        let temp_root = root.0.join("temp");
        fs::create_dir_all(temp_root.join("job-stale")).unwrap();
        fs::create_dir_all(temp_root.join("keep-me")).unwrap();
        let state = FileConversionState::default();
        state.initialize(temp_root.clone()).unwrap();
        fs::create_dir_all(temp_root.join("job-current-stale")).unwrap();

        state.shutdown_cleanup();

        assert!(!temp_root.join("job-current-stale").exists());
        assert!(temp_root.join("keep-me").exists());
    }
}
