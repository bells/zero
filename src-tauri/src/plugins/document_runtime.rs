//! Installed document jobs owned by a debug plugin view. The signed engine policy remains
//! in the existing File engine bridge. This adapter exposes the isolated QA fallback.
mod resources;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, WebviewWindow};

use crate::services::file::artifacts::prepare_provider_output;
use crate::services::file::built_in::ZeroFileBuiltInProvider;
use crate::services::file::contracts::{
    FileConversionDirection, FileConversionError, FileConversionProgress, FileConversionStage,
};
use crate::services::file::engine_bridge::{development_assets_enabled, FileEngineBridgeState};
use crate::services::file::provider::{
    FileConversionCancellationToken, FileConversionProgressSink, FileConversionProvider,
    ProviderConversionRequest,
};
use crate::services::file::result_actions::{run_platform_output_action, CompletedOutputAction};

use super::protocol::{PluginError, PluginMethod, PluginRequest};
use super::registry::PluginRegistryState;
use super::session::{error, SessionKind};
use super::web_assets::WebSessions;
use super::web_runtime::{owner_from_registry, with_live_capability};
use resources::{Destination, SelectedInput, Workspace};

const CAPABILITY: &str = "documents.convert";

pub(crate) fn available() -> bool {
    !cfg!(feature = "file-tool")
        && development_assets_enabled()
        && super::protocol::web_runtime_enabled()
        && std::env::var_os("ZERO_DEV_HOME").is_some_and(|home| PathBuf::from(home).is_absolute())
}

#[derive(Clone)]
struct Owner {
    plugin: String,
    window: String,
    session: String,
    generation: u64,
}

impl Owner {
    fn from_request(plugin: &str, window: &str, request: &PluginRequest) -> Self {
        Self {
            plugin: plugin.into(),
            window: window.into(),
            session: request.session_id.clone(),
            generation: request.generation,
        }
    }

    fn matches(&self, request: &PluginRequest) -> bool {
        self.session == request.session_id && self.generation == request.generation
    }

    // Jobs outlive the start RPC, and revalidate the same installed owner at final publish.
    fn publish_live<T>(
        &self,
        app: &tauri::AppHandle,
        publish: impl FnOnce() -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        if !available() {
            return Err(error("documents.engineUnavailable"));
        }
        app.state::<PluginRegistryState>()
            .read_registry(|registry| {
                let sessions = app.state::<WebSessions>();
                let sessions = sessions.0.lock().map_err(|_| error("session.lock"))?;
                let session = sessions.get(&self.session, &self.window, self.generation)?;
                let live = owner_from_registry(registry, &self.plugin, &session.owner.view_id)
                    .map_err(|_| error("session.stale"))?;
                if !matches!(session.kind, SessionKind::View)
                    || session.owner.plugin_id != self.plugin
                    || session.owner.version != live.version
                    || session.owner.digest != live.digest
                    || session.owner.root != live.root
                    || !session.owner.permissions.iter().any(|p| p == CAPABILITY)
                    || !live.permissions.iter().any(|p| p == CAPABILITY)
                    || !registry.records().iter().any(|record| {
                        record.name == self.plugin
                            && record.protocol_manifest.as_ref().is_some_and(|manifest| {
                                manifest
                                    .required_capabilities
                                    .iter()
                                    .flatten()
                                    .any(|capability| capability.id == CAPABILITY)
                            })
                    })
                {
                    return Err(error("session.stale"));
                }
                publish()
            })
            .map_err(|_| error("plugin.unavailable"))?
    }
}

struct Selection {
    owner: Owner,
    input: Arc<SelectedInput>,
}

#[derive(Default)]
struct Runtime {
    shutting_down: bool,
    dialog: bool,
    inputs: HashMap<String, Selection>,
    jobs: HashMap<String, Arc<Job>>,
    active: Option<Arc<Job>>,
}

#[derive(Default)]
pub(crate) struct DocumentState(Mutex<Runtime>);

impl DocumentState {
    fn lock(&self) -> Result<MutexGuard<'_, Runtime>, PluginError> {
        self.0
            .lock()
            .map_err(|_| error("documents.stateUnavailable"))
    }

    fn acquire_picker(&self) -> Result<PickerLease<'_>, PluginError> {
        let mut runtime = self.lock()?;
        if runtime.shutting_down {
            return Err(error("documents.shuttingDown"));
        }
        if runtime.dialog {
            return Err(error("documents.pickerBusy"));
        }
        runtime.dialog = true;
        Ok(PickerLease(self))
    }

    pub(crate) fn close_window(&self, label: &str) {
        if let Ok(mut runtime) = self.lock() {
            runtime.inputs.remove(label);
            if let Some(job) = runtime.jobs.remove(label) {
                let _ = job.cancel();
            }
        }
    }

    pub(crate) fn revoke(&self, plugin: &str) {
        if let Ok(mut runtime) = self.lock() {
            runtime
                .inputs
                .retain(|_, selection| selection.owner.plugin != plugin);
            runtime.jobs.retain(|_, job| {
                if job.owner.plugin != plugin {
                    return true;
                }
                let _ = job.cancel();
                false
            });
        }
    }

    pub(crate) fn cancel_request(&self, request: &PluginRequest) {
        if request.method != "documents.start" {
            return;
        }
        if let Ok(runtime) = self.lock() {
            if let Some(job) = runtime
                .active
                .as_ref()
                .filter(|job| job.start_request == request.request_id && job.owner.matches(request))
            {
                let _ = job.cancel();
            }
        }
    }

    pub(crate) fn shutdown(&self) -> bool {
        let Ok(mut runtime) = self.lock() else {
            return false;
        };
        if runtime.shutting_down {
            return false;
        }
        runtime.shutting_down = true;
        runtime.inputs.clear();
        runtime.jobs.clear();
        if let Some(active) = &runtime.active {
            let _ = active.cancel();
        }
        true
    }

    pub(crate) fn is_draining(&self) -> bool {
        self.lock().is_ok_and(|runtime| runtime.active.is_some())
    }

    fn find_job(
        &self,
        caller: &str,
        request: &PluginRequest,
        id: &str,
    ) -> Result<Arc<Job>, PluginError> {
        self.lock()?
            .jobs
            .get(caller)
            .filter(|job| job.id == id && job.owner.matches(request))
            .cloned()
            .ok_or_else(|| error("documents.unknownJob"))
    }
}

struct PickerLease<'a>(&'a DocumentState);

impl Drop for PickerLease<'_> {
    fn drop(&mut self) {
        if let Ok(mut runtime) = self.0.lock() {
            runtime.dialog = false;
        }
    }
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Status {
    Preparing,
    Running,
    Cancelling,
    Completed,
    Failed,
    Cancelled,
}

impl Status {
    fn active(self) -> bool {
        matches!(self, Self::Preparing | Self::Running | Self::Cancelling)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobSnapshot {
    id: String,
    status: Status,
    stage: Option<FileConversionStage>,
    percent: Option<u8>,
    output_name: String,
    error_code: Option<String>,
}

struct JobDetails {
    snapshot: JobSnapshot,
    output_identity: Option<(u64, u64)>,
}

struct Job {
    id: String,
    owner: Owner,
    start_request: String,
    destination: Destination,
    details: Mutex<JobDetails>,
    cancellation: FileConversionCancellationToken,
}

impl Job {
    fn lock(&self) -> Result<MutexGuard<'_, JobDetails>, PluginError> {
        self.details
            .lock()
            .map_err(|_| error("documents.stateUnavailable"))
    }

    fn cancel(&self) -> Result<(), PluginError> {
        let mut details = self.lock()?;
        if details.snapshot.status.active() {
            self.cancellation.cancel();
            details.snapshot.status = Status::Cancelling;
        }
        Ok(())
    }

    fn set_stage(&self, stage: FileConversionStage) -> Result<(), PluginError> {
        let mut details = self.lock()?;
        self.cancellation.check().map_err(file_error)?;
        details.snapshot.stage = Some(stage);
        details.snapshot.percent = None;
        details.snapshot.status = Status::Running;
        Ok(())
    }

    fn reveal(&self) -> Result<(), PluginError> {
        let details = self.lock()?;
        let identity = details
            .output_identity
            .ok_or_else(|| error("documents.jobIncomplete"))?;
        if self.destination.output_identity()? != identity {
            return Err(error("documents.outputChanged"));
        }
        run_platform_output_action(&self.destination.path, CompletedOutputAction::Reveal)
            .map_err(file_error)
    }
}

impl FileConversionProgressSink for Job {
    fn report(&self, progress: FileConversionProgress) -> Result<(), FileConversionError> {
        let Ok(mut details) = self.lock() else {
            self.cancellation.cancel();
            return self.cancellation.check();
        };
        self.cancellation.check()?;
        let (stage, percent) = match progress {
            FileConversionProgress::Indeterminate { stage } => (stage, None),
            FileConversionProgress::Percentage { stage, percent } => {
                (stage, Some(percent.min(100)))
            }
        };
        details.snapshot.stage = Some(stage);
        details.snapshot.percent = percent;
        Ok(())
    }
}

pub(crate) fn dispatch(
    app: &tauri::AppHandle,
    caller: &str,
    request: &PluginRequest,
    method: PluginMethod,
) -> Result<Value, PluginError> {
    if !available() {
        return Err(error("documents.engineUnavailable"));
    }
    let state = app.state::<DocumentState>();
    match method {
        PluginMethod::DocumentChoose(_) => choose(app, &state, caller, request),
        PluginMethod::DocumentStart(input) => start(app, &state, caller, request, &input.id),
        PluginMethod::DocumentStatus(input) => {
            with_live_capability(app, caller, request, CAPABILITY, |_| {
                let job = state.find_job(caller, request, &input.id)?;
                let snapshot = job.lock()?.snapshot.clone();
                to_value(snapshot)
            })
        }
        PluginMethod::DocumentCancel(input) => {
            with_live_capability(app, caller, request, CAPABILITY, |_| {
                state.find_job(caller, request, &input.id)?.cancel()?;
                Ok(Value::Null)
            })
        }
        PluginMethod::DocumentReveal(input) => {
            with_live_capability(app, caller, request, CAPABILITY, |_| {
                state.find_job(caller, request, &input.id)?.reveal()?;
                Ok(Value::Null)
            })
        }
        _ => Err(error("request.invalid")),
    }
}

fn window(app: &tauri::AppHandle, caller: &str) -> Result<WebviewWindow, PluginError> {
    app.get_webview_window(caller)
        .ok_or_else(|| error("session.revoked"))
}

fn choose(
    app: &tauri::AppHandle,
    state: &DocumentState,
    caller: &str,
    request: &PluginRequest,
) -> Result<Value, PluginError> {
    let _picker =
        with_live_capability(app, caller, request, CAPABILITY, |_| state.acquire_picker())?;
    let window = window(app, caller)?;
    let Some(selection) = tauri::async_runtime::block_on(
        rfd::AsyncFileDialog::new()
            .set_parent(&window)
            .add_filter("PDF and Word", &["pdf", "docx"])
            .pick_file(),
    ) else {
        return Ok(Value::Null);
    };
    with_live_capability(app, caller, request, CAPABILITY, |_| Ok(()))?;
    let input = Arc::new(SelectedInput::open(selection.path())?);
    let response = to_value(input.info.clone())?;
    with_live_capability(app, caller, request, CAPABILITY, |sessions| {
        let session = sessions.get(&request.session_id, caller, request.generation)?;
        let mut runtime = state.lock()?;
        if runtime.shutting_down {
            return Err(error("documents.shuttingDown"));
        }
        runtime.inputs.insert(
            caller.into(),
            Selection {
                owner: Owner::from_request(&session.owner.plugin_id, caller, request),
                input,
            },
        );
        Ok(response)
    })
}

fn start(
    app: &tauri::AppHandle,
    state: &DocumentState,
    caller: &str,
    request: &PluginRequest,
    input_id: &str,
) -> Result<Value, PluginError> {
    let (_picker, input) = with_live_capability(app, caller, request, CAPABILITY, |_| {
        let picker = state.acquire_picker()?;
        let runtime = state.lock()?;
        if runtime.active.is_some() {
            return Err(error("documents.busy"));
        }
        let selected = runtime
            .inputs
            .get(caller)
            .filter(|selection| {
                selection.owner.matches(request) && selection.input.info.id == input_id
            })
            .ok_or_else(|| error("documents.unknownInput"))?;
        Ok((picker, Arc::clone(&selected.input)))
    })?;
    let window = window(app, caller)?;
    let extension = crate::services::file::output::target_extension(input.info.direction);
    let Some(output) = tauri::async_runtime::block_on(
        rfd::AsyncFileDialog::new()
            .set_parent(&window)
            .set_directory(&input.parent)
            .set_file_name(input.suggested_name())
            .add_filter(extension.to_ascii_uppercase(), &[extension])
            .save_file(),
    ) else {
        return Ok(Value::Null);
    };
    with_live_capability(app, caller, request, CAPABILITY, |_| Ok(()))?;
    let destination = Destination::approve(output.path(), input.info.direction)?;
    let id = nonce()?;
    let snapshot = JobSnapshot {
        id: id.clone(),
        status: Status::Preparing,
        stage: Some(FileConversionStage::Validating),
        percent: None,
        output_name: destination.file_name.clone(),
        error_code: None,
    };
    let response = to_value(snapshot.clone())?;
    with_live_capability(app, caller, request, CAPABILITY, |sessions| {
        let session = sessions.get(&request.session_id, caller, request.generation)?;
        let owner = Owner::from_request(&session.owner.plugin_id, caller, request);
        let mut runtime = state.lock()?;
        if runtime.shutting_down {
            return Err(error("documents.shuttingDown"));
        }
        if runtime.active.is_some() {
            return Err(error("documents.busy"));
        }
        let job = Arc::new(Job {
            id,
            owner,
            start_request: request.request_id.clone(),
            destination,
            details: Mutex::new(JobDetails {
                snapshot,
                output_identity: None,
            }),
            cancellation: FileConversionCancellationToken::default(),
        });
        runtime.jobs.insert(caller.into(), Arc::clone(&job));
        runtime.active = Some(Arc::clone(&job));
        let worker_app = app.clone();
        tauri::async_runtime::spawn_blocking(move || run_job(&worker_app, job, input));
        Ok(response)
    })
}

fn run_job(app: &tauri::AppHandle, job: Arc<Job>, input: Arc<SelectedInput>) {
    let bridge = Arc::clone(&app.state::<FileEngineBridgeState>().bridge);
    let result = convert(app, &job, &input, Arc::clone(&bridge));
    if let Err(failure) = result {
        if let Ok(mut details) = job.lock() {
            details.snapshot.status = if job.cancellation.is_cancelled() {
                Status::Cancelled
            } else {
                Status::Failed
            };
            details.snapshot.stage = None;
            details.snapshot.percent = None;
            details.snapshot.error_code = Some(failure.code);
        }
    }
    bridge.schedule_idle_teardown(app);
    if let Ok(mut runtime) = app.state::<DocumentState>().lock() {
        if runtime
            .active
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(active, &job))
        {
            runtime.active = None;
        }
    }
}

fn convert(
    app: &tauri::AppHandle,
    job: &Job,
    input: &SelectedInput,
    bridge: Arc<crate::services::file::engine_bridge::FileEngineBridge>,
) -> Result<(), PluginError> {
    job.owner
        .publish_live(app, || job.cancellation.check().map_err(file_error))?;
    let workspace = Workspace::create(&job.id).map_err(file_error)?;
    let source_path = input.stage(&workspace.path, &job.cancellation)?;
    job.set_stage(FileConversionStage::WaitingForProvider)?;
    let provider = match input.info.direction {
        FileConversionDirection::PdfToDocx => {
            ZeroFileBuiltInProvider::pdf_to_docx(app.clone(), bridge)
        }
        FileConversionDirection::DocxToPdf => {
            ZeroFileBuiltInProvider::docx_to_pdf_macos(app.clone(), bridge)
        }
    };
    let result = provider
        .convert(
            &ProviderConversionRequest {
                job_id: job.id.clone(),
                direction: input.info.direction,
                source_path,
                temp_directory: workspace.path.clone(),
            },
            job,
            &job.cancellation,
        )
        .map_err(file_error)?;
    job.set_stage(FileConversionStage::Finalizing)?;
    job.destination.verify_directory()?;
    let prepared = prepare_provider_output(
        &workspace.path,
        &result.path,
        &job.destination.path,
        input.info.direction,
        &job.id,
    )
    .map_err(file_error)?;
    job.owner.publish_live(app, || {
        let mut details = job.lock()?;
        job.cancellation.check().map_err(file_error)?;
        job.destination.verify_directory()?;
        prepared.publish().map_err(file_error)?;
        // A user can move the successfully committed file immediately. Reveal will
        // verify the recorded identity, and conversion itself remains successful.
        details.output_identity = prepared.identity().ok();
        details.snapshot.status = Status::Completed;
        details.snapshot.stage = None;
        details.snapshot.percent = None;
        Ok(())
    })
}

fn nonce() -> Result<String, PluginError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| error("documents.entropy"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn to_value(value: impl Serialize) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(|_| error("response.invalid"))
}

fn file_error(failure: FileConversionError) -> PluginError {
    let code = serde_json::to_value(failure.code).unwrap_or(Value::Null);
    let code = code.as_str().unwrap_or("internal");
    PluginError {
        code: format!("documents.{code}"),
        message: "The local document operation could not be completed.".into(),
        retryable: failure.retryable,
    }
}
