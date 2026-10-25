use super::shortcut_transaction::{
    cleanup_owned_bindings, replace_owned_binding, ShortcutBackend, TransactionError,
};
use super::snap_shortcut_config::{self, SnapShortcutConfig};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlobalShortcutActionId {
    SnapCapture,
    SnapOcr,
    LaunchPanel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlobalShortcutRegistrationState {
    Active,
    Disabled,
    Unassigned,
    Inactive,
    Conflict,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutErrorCode {
    Invalid,
    Duplicate,
    Conflict,
    Persistence,
    Rollback,
    Busy,
    ReadOnly,
    Unsupported,
    InvalidConfiguration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutError {
    pub code: ShortcutErrorCode,
}
impl From<ShortcutErrorCode> for ShortcutError {
    fn from(code: ShortcutErrorCode) -> Self {
        Self { code }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSnapShortcutInput {
    pub id: GlobalShortcutActionId,
    pub accelerator: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutSnapshot {
    pub id: GlobalShortcutActionId,
    pub plugin_name: String,
    pub accelerator: Option<String>,
    pub default_accelerator: Option<String>,
    pub editable: bool,
    pub enabled: bool,
    pub registered: bool,
    pub platform_supported: bool,
    pub registration_state: GlobalShortcutRegistrationState,
    pub diagnostic_code: Option<String>,
}

#[derive(Clone, Default)]
struct Runtime {
    config: SnapShortcutConfig,
    owned_bindings: [BTreeSet<String>; 2],
    conflicts: [bool; 2],
    load_diagnostic: Option<String>,
}

impl Runtime {
    fn registered(&self, id: GlobalShortcutActionId) -> bool {
        action_index(id).is_some_and(|index| {
            self.config
                .accelerator(id)
                .is_some_and(|value| self.owned_bindings[index].contains(value))
        })
    }

    fn has_residue(&self, index: usize, id: GlobalShortcutActionId) -> bool {
        self.owned_bindings[index]
            .iter()
            .any(|value| Some(value.as_str()) != self.config.accelerator(id))
    }
}

#[derive(Default)]
pub struct SnapShortcutState {
    runtime: Mutex<Runtime>,
    updating: Mutex<bool>,
    available: Condvar,
}

// This lease serializes native transactions without holding the snapshot mutex across
// global-shortcut calls, which may synchronously wait for the AppKit thread.
struct UpdateLease<'a>(&'a SnapShortcutState);
impl Drop for UpdateLease<'_> {
    fn drop(&mut self) {
        *self
            .0
            .updating
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = false;
        self.0.available.notify_one();
    }
}
impl SnapShortcutState {
    fn lease(&self) -> Result<UpdateLease<'_>, ShortcutError> {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut updating = self
            .updating
            .lock()
            .map_err(|_| ShortcutError::from(ShortcutErrorCode::Busy))?;
        while *updating {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(ShortcutErrorCode::Busy.into());
            }
            updating = self
                .available
                .wait_timeout(updating, remaining)
                .map_err(|_| ShortcutError::from(ShortcutErrorCode::Busy))?
                .0;
        }
        *updating = true;
        drop(updating);
        Ok(UpdateLease(self))
    }
    fn snapshot(&self) -> Runtime {
        self.runtime
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn store(&self, value: Runtime) {
        *self.runtime.lock().unwrap_or_else(|e| e.into_inner()) = value;
    }
}

fn config_path() -> std::path::PathBuf {
    crate::brand::canonical_data_root(&crate::brand::default_home()).join("snap-shortcuts.v1.json")
}
fn action_index(id: GlobalShortcutActionId) -> Option<usize> {
    match id {
        GlobalShortcutActionId::SnapCapture => Some(0),
        GlobalShortcutActionId::SnapOcr => Some(1),
        GlobalShortcutActionId::LaunchPanel => None,
    }
}
const SNAP_ACTIONS: [GlobalShortcutActionId; 2] = [
    GlobalShortcutActionId::SnapCapture,
    GlobalShortcutActionId::SnapOcr,
];

pub fn initialize(app: &tauri::AppHandle) {
    let state = app.state::<SnapShortcutState>();
    let mut runtime = state.snapshot();
    match snap_shortcut_config::load(&config_path()) {
        Ok(config) => runtime.config = config,
        Err(_) => runtime.load_diagnostic = Some("shortcut.invalidConfiguration".into()),
    }
    state.store(runtime);
    let _ = sync_snap_shortcuts(
        app,
        crate::plugin_is_enabled(app, crate::brand::ZERO_SNAP_PLUGIN_ID),
    );
}

fn cleanup_runtime_bindings(
    runtime: &mut Runtime,
    backend: &mut impl ShortcutBackend,
    enabled: bool,
) -> Result<(), TransactionError> {
    let mut failed = false;
    for (index, id) in SNAP_ACTIONS.into_iter().enumerate() {
        let retained = if enabled {
            runtime.config.accelerator(id)
        } else {
            None
        };
        let result = cleanup_owned_bindings(backend, &mut runtime.owned_bindings[index], retained);
        if result.is_err() {
            runtime.conflicts[index] = true;
            failed = true;
        } else if !enabled || runtime.registered(id) {
            runtime.conflicts[index] = false;
        }
    }
    if failed {
        Err(TransactionError::Unregister)
    } else {
        Ok(())
    }
}

fn sync_runtime_bindings(
    runtime: &mut Runtime,
    backend: &mut impl ShortcutBackend,
    enabled: bool,
) -> Result<(), TransactionError> {
    let cleanup = cleanup_runtime_bindings(runtime, backend, enabled);
    if enabled {
        for (index, id) in SNAP_ACTIONS.into_iter().enumerate() {
            if runtime.has_residue(index, id) {
                continue;
            }
            if let Some(binding) = runtime.config.accelerator(id) {
                if !runtime.registered(id) {
                    if backend.register(binding).is_ok() {
                        runtime.owned_bindings[index].insert(binding.into());
                        runtime.conflicts[index] = false;
                    } else {
                        // Startup registration conflicts are visible state, never a fatal error.
                        runtime.conflicts[index] = true;
                    }
                }
            }
        }
    }
    cleanup
}

pub fn sync_snap_shortcuts(app: &tauri::AppHandle, enabled: bool) -> Result<(), ShortcutError> {
    let state = app.state::<SnapShortcutState>();
    let _lease = state.lease()?;
    let mut runtime = state.snapshot();
    let config = runtime.config.clone();
    let result = sync_runtime_bindings(
        &mut runtime,
        &mut NativeBackend {
            app,
            config: &config,
        },
        enabled && platform_supported(),
    );
    state.store(runtime);
    let _ = app.emit("global-shortcuts-changed", ());
    result.map_err(|_| ShortcutErrorCode::Conflict.into())
}

pub fn exact_action(app: &tauri::AppHandle, shortcut: &Shortcut) -> Option<GlobalShortcutActionId> {
    action_for_shortcut(&app.state::<SnapShortcutState>().snapshot(), shortcut)
}

fn action_for_shortcut(runtime: &Runtime, shortcut: &Shortcut) -> Option<GlobalShortcutActionId> {
    SNAP_ACTIONS.into_iter().find_map(|id| {
        (runtime.registered(id)
            && runtime
                .config
                .accelerator(id)
                .and_then(|v| v.parse::<Shortcut>().ok())
                .as_ref()
                == Some(shortcut))
        .then_some(id)
    })
}

struct NativeBackend<'a> {
    app: &'a tauri::AppHandle,
    config: &'a SnapShortcutConfig,
}
impl ShortcutBackend for NativeBackend<'_> {
    fn register(&mut self, value: &str) -> Result<(), ()> {
        self.app.global_shortcut().register(value).map_err(|_| ())
    }
    fn unregister(&mut self, value: &str) -> Result<(), ()> {
        self.app.global_shortcut().unregister(value).map_err(|_| ())
    }
    fn persist(&mut self) -> Result<(), ()> {
        snap_shortcut_config::save(&config_path(), self.config)
    }
}

pub fn set_snap_shortcut(
    app: &tauri::AppHandle,
    input: SetSnapShortcutInput,
) -> Result<Vec<GlobalShortcutSnapshot>, ShortcutError> {
    if !cfg!(feature = "bundled-tools") || !platform_supported() {
        return Err(ShortcutErrorCode::Unsupported.into());
    }
    let index = action_index(input.id).ok_or(ShortcutError::from(ShortcutErrorCode::ReadOnly))?;
    let state = app.state::<SnapShortcutState>();
    let _lease = state.lease()?;
    let mut runtime = state.snapshot();
    let next = runtime.config.replace(input.id, input.accelerator)?;
    let enabled = crate::plugin_is_enabled(app, crate::brand::ZERO_SNAP_PLUGIN_ID);
    let result = update_runtime_binding(
        &mut runtime,
        &mut NativeBackend { app, config: &next },
        input.id,
        index,
        next.clone(),
        enabled,
    );
    // Even failed rollback can change the actual registration set. Publish that truth
    // before returning the typed error; other windows must not retain an active badge.
    state.store(runtime);
    let _ = app.emit("global-shortcuts-changed", ());
    result.map_err(|error| {
        ShortcutError::from(match error {
            TransactionError::Persistence => ShortcutErrorCode::Persistence,
            TransactionError::Rollback => ShortcutErrorCode::Rollback,
            _ => ShortcutErrorCode::Conflict,
        })
    })?;
    global_shortcut_snapshots(app).map_err(|_| ShortcutErrorCode::Conflict.into())
}

fn update_runtime_binding(
    runtime: &mut Runtime,
    backend: &mut impl ShortcutBackend,
    id: GlobalShortcutActionId,
    index: usize,
    next: SnapShortcutConfig,
    enabled: bool,
) -> Result<(), TransactionError> {
    // Disabled edits must retire every still-owned binding before changing the file.
    // Enabled edits retry cleanup of any earlier unpersisted replacement first.
    cleanup_runtime_bindings(runtime, backend, enabled)?;
    let previous = if runtime.registered(id) {
        runtime.config.accelerator(id)
    } else {
        None
    };
    let result = replace_owned_binding(
        backend,
        &mut runtime.owned_bindings[index],
        previous,
        next.accelerator(id),
        enabled,
    );
    if result.is_err() {
        runtime.conflicts[index] = runtime.has_residue(index, id)
            || (enabled && !runtime.registered(id) && runtime.config.accelerator(id).is_some());
        return result;
    }
    runtime.config = next;
    runtime.conflicts[index] = false;
    runtime.load_diagnostic = None;
    Ok(())
}

fn platform_supported() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

pub fn global_shortcut_snapshots(
    app: &tauri::AppHandle,
) -> Result<Vec<GlobalShortcutSnapshot>, String> {
    #[cfg(not(feature = "bundled-tools"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
    #[cfg(feature = "bundled-tools")]
    {
        let runtime = app.state::<SnapShortcutState>().snapshot();
        let enabled = crate::plugin_is_enabled(app, crate::brand::ZERO_SNAP_PLUGIN_ID);
        let mut snapshots = Vec::new();
        for (index, id) in SNAP_ACTIONS.into_iter().enumerate() {
            let accelerator = runtime.config.accelerator(id).map(str::to_string);
            snapshots.push(GlobalShortcutSnapshot {
                id,
                plugin_name: crate::brand::ZERO_SNAP_PLUGIN_ID.into(),
                registration_state: registration_state(
                    platform_supported(),
                    enabled,
                    accelerator.is_some(),
                    runtime.registered(id),
                    runtime.conflicts[index],
                ),
                accelerator,
                default_accelerator: SnapShortcutConfig::default()
                    .accelerator(id)
                    .map(str::to_string),
                editable: true,
                enabled,
                registered: runtime.registered(id),
                platform_supported: platform_supported(),
                diagnostic_code: if runtime.conflicts[index] {
                    Some("shortcut.conflict".into())
                } else {
                    runtime.load_diagnostic.clone()
                },
            });
        }
        let enabled = crate::plugin_is_enabled(app, crate::brand::ZERO_LAUNCH_PLUGIN_ID);
        let registered = app
            .global_shortcut()
            .is_registered(crate::QUICK_LAUNCHER_SHORTCUT);
        snapshots.push(GlobalShortcutSnapshot {
            id: GlobalShortcutActionId::LaunchPanel,
            plugin_name: crate::brand::ZERO_LAUNCH_PLUGIN_ID.into(),
            accelerator: Some(crate::QUICK_LAUNCHER_SHORTCUT.into()),
            default_accelerator: Some(crate::QUICK_LAUNCHER_SHORTCUT.into()),
            editable: false,
            enabled,
            registered,
            platform_supported: platform_supported(),
            registration_state: registration_state(
                platform_supported(),
                enabled,
                true,
                registered,
                enabled && !registered,
            ),
            diagnostic_code: None,
        });
        Ok(snapshots)
    }
}

#[cfg(any(test, feature = "bundled-tools"))]
fn registration_state(
    supported: bool,
    enabled: bool,
    assigned: bool,
    registered: bool,
    conflict: bool,
) -> GlobalShortcutRegistrationState {
    if !supported {
        GlobalShortcutRegistrationState::Unsupported
    } else if conflict {
        GlobalShortcutRegistrationState::Conflict
    } else if !assigned {
        GlobalShortcutRegistrationState::Unassigned
    } else if !enabled {
        GlobalShortcutRegistrationState::Disabled
    } else if registered {
        GlobalShortcutRegistrationState::Active
    } else {
        GlobalShortcutRegistrationState::Inactive
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_disabled_unassigned_unsupported_and_conflict() {
        assert_eq!(
            registration_state(true, false, true, false, false),
            GlobalShortcutRegistrationState::Disabled
        );
        assert_eq!(
            registration_state(true, true, false, false, false),
            GlobalShortcutRegistrationState::Unassigned
        );
        assert_eq!(
            registration_state(false, true, true, false, true),
            GlobalShortcutRegistrationState::Unsupported
        );
        assert_eq!(
            registration_state(true, true, true, false, true),
            GlobalShortcutRegistrationState::Conflict
        );
        assert_eq!(
            registration_state(true, true, true, true, false),
            GlobalShortcutRegistrationState::Active
        );
    }
    #[test]
    fn dispatches_only_the_registered_exact_action() {
        let mut runtime = Runtime::default();
        runtime.config.snap_ocr = Some("Alt+B".into());
        runtime.owned_bindings = [
            BTreeSet::from(["Alt+A".into()]),
            BTreeSet::from(["Alt+B".into()]),
        ];
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+A".parse().unwrap()),
            Some(GlobalShortcutActionId::SnapCapture)
        );
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+B".parse().unwrap()),
            Some(GlobalShortcutActionId::SnapOcr)
        );
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+Shift+B".parse().unwrap()),
            None
        );
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+C".parse().unwrap()),
            None
        );
        runtime.owned_bindings = Default::default();
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+B".parse().unwrap()),
            None
        );
    }

    #[test]
    fn update_lease_releases_all_mutexes_and_serializes_transactions() {
        let state = std::sync::Arc::new(SnapShortcutState::default());
        let lease = state.lease().unwrap();
        assert!(state.runtime.try_lock().is_ok());
        assert!(state.updating.try_lock().is_ok());
        let (sent, received) = std::sync::mpsc::channel();
        let worker_state = state.clone();
        let worker = std::thread::spawn(move || {
            let _next = worker_state.lease().unwrap();
            sent.send(()).unwrap();
        });
        assert!(received.recv_timeout(Duration::from_millis(25)).is_err());
        drop(lease);
        received.recv_timeout(Duration::from_secs(1)).unwrap();
        worker.join().unwrap();
    }

    #[test]
    fn shortcut_input_serializes_null_and_camel_case_action() {
        let value = serde_json::to_value(SetSnapShortcutInput {
            id: GlobalShortcutActionId::SnapOcr,
            accelerator: None,
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({"id":"snapOcr", "accelerator":null})
        );
    }
    struct MemoryBackend {
        bindings: BTreeSet<String>,
        fail_register: BTreeSet<String>,
        fail_unregister: BTreeSet<String>,
        fail_save: bool,
        persisted: bool,
    }

    impl MemoryBackend {
        fn active() -> Self {
            Self {
                bindings: BTreeSet::from(["Alt+A".into()]),
                fail_register: BTreeSet::new(),
                fail_unregister: BTreeSet::new(),
                fail_save: false,
                persisted: false,
            }
        }
    }
    impl ShortcutBackend for MemoryBackend {
        fn register(&mut self, value: &str) -> Result<(), ()> {
            if self.fail_register.contains(value) {
                return Err(());
            }
            if self.bindings.insert(value.into()) {
                Ok(())
            } else {
                Err(())
            }
        }
        fn unregister(&mut self, value: &str) -> Result<(), ()> {
            if self.fail_unregister.contains(value) {
                return Err(());
            }
            self.bindings.remove(value);
            Ok(())
        }
        fn persist(&mut self) -> Result<(), ()> {
            if self.fail_save {
                return Err(());
            }
            self.persisted = true;
            Ok(())
        }
    }
    fn active_runtime() -> Runtime {
        Runtime {
            owned_bindings: [BTreeSet::from(["Alt+A".into()]), BTreeSet::new()],
            ..Default::default()
        }
    }

    #[test]
    fn disabled_edits_cannot_forget_an_old_binding_after_failed_disable() {
        let mut runtime = active_runtime();
        let mut backend = MemoryBackend::active();
        backend.fail_unregister.insert("Alt+A".into());
        assert_eq!(
            sync_runtime_bindings(&mut runtime, &mut backend, false),
            Err(TransactionError::Unregister)
        );
        assert!(runtime.registered(GlobalShortcutActionId::SnapCapture));
        let original = runtime.config.clone();
        assert_eq!(
            update_runtime_binding(
                &mut runtime,
                &mut backend,
                GlobalShortcutActionId::SnapCapture,
                0,
                original.clone(),
                false
            ),
            Err(TransactionError::Unregister)
        );
        assert_eq!(runtime.config, original);
        assert_eq!(runtime.owned_bindings[0], backend.bindings);
        assert!(runtime.conflicts[0]);
        assert!(!backend.persisted);
        backend.fail_unregister.clear();
        update_runtime_binding(
            &mut runtime,
            &mut backend,
            GlobalShortcutActionId::SnapCapture,
            0,
            original.clone(),
            false,
        )
        .unwrap();
        assert_eq!(runtime.config, original);
        assert!(!runtime.registered(GlobalShortcutActionId::SnapCapture));
        assert!(backend.bindings.is_empty());
        assert!(backend.persisted);
    }

    #[test]
    fn runtime_retains_rollback_residue_and_retries_it_before_a_later_update() {
        let mut runtime = active_runtime();
        let mut backend = MemoryBackend::active();
        backend.fail_save = true;
        backend.fail_unregister.insert("Alt+B".into());
        let next = runtime
            .config
            .replace(GlobalShortcutActionId::SnapCapture, Some("Alt+B".into()))
            .unwrap();
        assert_eq!(
            update_runtime_binding(
                &mut runtime,
                &mut backend,
                GlobalShortcutActionId::SnapCapture,
                0,
                next,
                true
            ),
            Err(TransactionError::Rollback)
        );
        assert_eq!(runtime.config.snap_capture.as_deref(), Some("Alt+A"));
        assert_eq!(
            runtime.owned_bindings[0],
            BTreeSet::from(["Alt+A".into(), "Alt+B".into()])
        );
        assert!(runtime.conflicts[0]);
        assert_eq!(
            registration_state(
                true,
                true,
                true,
                runtime.registered(GlobalShortcutActionId::SnapCapture),
                runtime.conflicts[0]
            ),
            GlobalShortcutRegistrationState::Conflict
        );
        assert_eq!(
            action_for_shortcut(&runtime, &"Alt+B".parse().unwrap()),
            None
        );
        let next = runtime
            .config
            .replace(GlobalShortcutActionId::SnapOcr, Some("Alt+C".into()))
            .unwrap();
        assert_eq!(
            update_runtime_binding(
                &mut runtime,
                &mut backend,
                GlobalShortcutActionId::SnapOcr,
                1,
                next.clone(),
                true
            ),
            Err(TransactionError::Unregister)
        );
        assert_eq!(runtime.config.snap_ocr, None);
        backend.fail_unregister.clear();
        backend.fail_save = false;
        update_runtime_binding(
            &mut runtime,
            &mut backend,
            GlobalShortcutActionId::SnapOcr,
            1,
            next,
            true,
        )
        .unwrap();
        assert_eq!(runtime.owned_bindings[0], BTreeSet::from(["Alt+A".into()]));
        assert_eq!(runtime.owned_bindings[1], BTreeSet::from(["Alt+C".into()]));
        assert_eq!(
            backend.bindings,
            BTreeSet::from(["Alt+A".into(), "Alt+C".into()])
        );
        assert!(!runtime.conflicts[0]);
    }

    #[test]
    fn disable_retries_all_owned_bindings_and_keeps_only_failed_residue() {
        let mut runtime = active_runtime();
        runtime.owned_bindings[0].insert("Alt+B".into());
        runtime.owned_bindings[1].insert("Alt+C".into());
        runtime.config.snap_ocr = Some("Alt+C".into());
        let mut backend = MemoryBackend::active();
        backend.bindings = BTreeSet::from(["Alt+A".into(), "Alt+B".into(), "Alt+C".into()]);
        backend.fail_unregister.insert("Alt+B".into());
        assert_eq!(
            sync_runtime_bindings(&mut runtime, &mut backend, false),
            Err(TransactionError::Unregister)
        );
        assert_eq!(runtime.owned_bindings[0], BTreeSet::from(["Alt+B".into()]));
        assert!(runtime.owned_bindings[1].is_empty());
        assert_eq!(backend.bindings, BTreeSet::from(["Alt+B".into()]));
        assert_eq!(
            registration_state(true, false, true, false, runtime.conflicts[0]),
            GlobalShortcutRegistrationState::Conflict
        );
        backend.fail_unregister.clear();
        sync_runtime_bindings(&mut runtime, &mut backend, false).unwrap();
        assert!(runtime.owned_bindings.iter().all(BTreeSet::is_empty));
        assert!(backend.bindings.is_empty());
        assert!(!runtime.conflicts[0]);
    }

    #[test]
    fn startup_registration_failure_remains_a_nonfatal_conflict() {
        let mut runtime = Runtime::default();
        let mut backend = MemoryBackend::active();
        backend.bindings.clear();
        backend.fail_register.insert("Alt+A".into());
        sync_runtime_bindings(&mut runtime, &mut backend, true).unwrap();
        assert!(!runtime.registered(GlobalShortcutActionId::SnapCapture));
        assert!(runtime.conflicts[0]);
        assert!(runtime.owned_bindings.iter().all(BTreeSet::is_empty));
    }
}
