//! Host-owned persisted one-shot state. This module grants no execution authority.
//! The host must validate the live installed owner, manifest background event and
//! grants before admission AND delivery, and revoke on disable/update/uninstall.
//! Packages calculate calendars/backoff; retries require explicit package policy
//! and provider idempotency. No timers, network or wall-clock timeout live here.
use crate::path_safety::validate_absolute_no_symlinks;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_STATE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_ATTEMPTS: u32 = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchedulerError {
    Invalid,
    Quota,
    Path,
    Corrupt,
    UnsupportedSchema,
    Unavailable,
    Busy,
    Stale,
    AttemptsExhausted,
    Entropy,
}
impl std::fmt::Display for SchedulerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "scheduler.{self:?}")
    }
}
impl std::error::Error for SchedulerError {}
type Result<T> = std::result::Result<T, SchedulerError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Owner {
    pub plugin_id: String,
    pub version: String,
    pub digest: String,
    pub root: PathBuf,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schedule {
    pub task_id: String,
    pub event_id: String,
    pub next_at_ms: u64,
    pub payload: Value,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Occurrence {
    pub owner: Owner,
    pub schedule: Schedule,
    pub generation: u64,
    pub occurrence_id: String,
    pub attempt: u32,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Status {
    Pending,
    InFlight,
    PendingRetry,
    Interrupted,
    Failed,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Task {
    owner: Owner,
    schedule: Schedule,
    generation: u64,
    status: Status,
    occurrence: Option<Occurrence>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    schema_version: u32,
    next_generation: u64,
    tasks: Vec<Task>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema_version: 1,
            next_generation: 1,
            tasks: Vec::new(),
        }
    }
}

/// Share one instance across host runners. A lifetime OS lock also excludes
/// independently opened stores/processes. The path is supplied ONLY by the host,
/// in an existing private directory; package paths must never reach this API.
/// Completed/cancelled/revoked records are deleted transactionally. A persisted
/// monotonic generation counter fences removed identities without tombstones;
/// pending and interrupted identities are never pruned. At most 256 records live.
pub struct Scheduler {
    path: PathBuf,
    _lock: File,
    state: Mutex<State>,
}
impl Scheduler {
    pub fn open(path: &Path) -> Result<Self> {
        validate_state_path(path)?;
        let lock_path = path.with_file_name(format!(
            "{}.lock",
            path.file_name()
                .ok_or(SchedulerError::Path)?
                .to_str()
                .ok_or(SchedulerError::Path)?
        ));
        validate_regular_or_missing(&lock_path)?;
        let lock = private_options()
            .read(true)
            .write(true)
            .create(true)
            .open(&lock_path)
            .map_err(|_| SchedulerError::Unavailable)?;
        lock.try_lock().map_err(|_| SchedulerError::Busy)?;
        validate_state_path(path)?;
        let state = read_state(path)?;
        validate_state(&state)?;
        let scheduler = Self {
            path: path.to_owned(),
            _lock: lock,
            state: Mutex::new(state),
        };
        let interrupted = scheduler
            .state
            .lock()
            .map_err(|_| SchedulerError::Unavailable)?
            .tasks
            .iter()
            .any(|task| task.status == Status::InFlight);
        if interrupted {
            scheduler.transaction(|state| {
                for task in &mut state.tasks {
                    if task.status == Status::InFlight {
                        task.status = Status::Interrupted;
                    }
                }
                Ok(())
            })?;
        }
        Ok(scheduler)
    }

    pub fn upsert(&self, owner: &Owner, schedule: Schedule) -> Result<u64> {
        validate_owner(owner, true)?;
        validate_schedule(&schedule)?;
        self.transaction(|state| upsert_state(state, owner, schedule))
    }
    pub fn prepare_upsert(&self, owner: &Owner, schedule: Schedule) -> Result<Prepared<'_, u64>> {
        validate_owner(owner, true)?;
        validate_schedule(&schedule)?;
        self.prepare_transaction(|state| upsert_state(state, owner, schedule))
    }

    pub fn cancel(&self, owner: &Owner, task_id: &str) -> Result<bool> {
        validate_owner(owner, false)?;
        validate_identifier(task_id)?;
        self.transaction(|state| cancel_state(state, owner, task_id))
    }
    pub fn prepare_cancel(&self, owner: &Owner, task_id: &str) -> Result<Prepared<'_, bool>> {
        validate_owner(owner, false)?;
        validate_identifier(task_id)?;
        self.prepare_transaction(|state| cancel_state(state, owner, task_id))
    }

    pub fn revoke(&self, owner: &Owner) -> Result<usize> {
        validate_owner(owner, false)?;
        self.transaction(|state| {
            check_owner(state, owner)?;
            let before = state.tasks.len();
            state.tasks.retain(|task| task.owner != *owner);
            Ok(before - state.tasks.len())
        })
    }

    /// Persist before handing work to the host. A missed deadline is one event.
    pub fn claim_due(&self, now_ms: u64) -> Result<Option<Occurrence>> {
        self.claim_due_excluding(now_ms, &[])
    }

    pub fn claim_due_excluding(
        &self,
        now_ms: u64,
        excluded: &[String],
    ) -> Result<Option<Occurrence>> {
        validate_time(now_ms)?;
        if self.next_deadline(excluded)?.is_none_or(|at| at > now_ms) {
            return Ok(None);
        }
        self.transaction(|state| {
            let candidate = state
                .tasks
                .iter()
                .enumerate()
                .filter(|(_, task)| {
                    matches!(task.status, Status::Pending | Status::PendingRetry)
                        && task.schedule.next_at_ms <= now_ms
                        && !excluded.contains(&task.owner.plugin_id)
                })
                .min_by_key(|(_, task)| (task.schedule.next_at_ms, task.generation))
                .map(|(index, _)| index);
            let Some(index) = candidate else {
                return Ok(None);
            };
            let task = &mut state.tasks[index];
            let occurrence = if task.status == Status::PendingRetry {
                task.occurrence.clone().ok_or(SchedulerError::Corrupt)?
            } else {
                Occurrence {
                    owner: task.owner.clone(),
                    schedule: task.schedule.clone(),
                    generation: task.generation,
                    occurrence_id: nonce()?,
                    attempt: 1,
                }
            };
            task.occurrence = Some(occurrence.clone());
            task.status = Status::InFlight;
            Ok(Some(occurrence))
        })
    }

    pub fn finish_and_schedule(
        &self,
        occurrence: &Occurrence,
        next: Option<u64>,
    ) -> Result<Option<u64>> {
        if let Some(at) = next {
            validate_time(at)?;
        }
        self.transaction(|state| finish_and_schedule_state(state, occurrence, next))
    }
    pub fn prepare_finish_and_schedule(
        &self,
        occurrence: &Occurrence,
        next: Option<u64>,
    ) -> Result<Prepared<'_, Option<u64>>> {
        if let Some(at) = next {
            validate_time(at)?;
        }
        self.prepare_transaction(|state| finish_and_schedule_state(state, occurrence, next))
    }

    pub fn defer_retry(&self, occurrence: &Occurrence, next: u64) -> Result<()> {
        validate_time(next)?;
        self.transaction(|state| defer_retry_state(state, occurrence, next))
    }
    pub fn prepare_defer_retry(
        &self,
        occurrence: &Occurrence,
        next: u64,
    ) -> Result<Prepared<'_, ()>> {
        validate_time(next)?;
        self.prepare_transaction(|state| defer_retry_state(state, occurrence, next))
    }

    pub fn next_deadline(&self, excluded: &[String]) -> Result<Option<u64>> {
        let state = self.state.lock().map_err(|_| SchedulerError::Unavailable)?;
        Ok(state
            .tasks
            .iter()
            .filter(|t| {
                matches!(t.status, Status::Pending | Status::PendingRetry)
                    && !excluded.contains(&t.owner.plugin_id)
            })
            .map(|t| t.schedule.next_at_ms)
            .min())
    }

    pub fn snapshot(&self) -> Result<Vec<(Owner, Schedule)>> {
        let state = self.state.lock().map_err(|_| SchedulerError::Unavailable)?;
        Ok(state
            .tasks
            .iter()
            .map(|t| (t.owner.clone(), t.schedule.clone()))
            .collect())
    }

    pub fn complete(&self, occurrence: &Occurrence) -> Result<()> {
        self.transaction(|state| {
            let index = active_index(state, occurrence)?;
            if state.tasks[index].status != Status::InFlight {
                return Err(SchedulerError::Stale);
            }
            state.tasks.remove(index);
            Ok(())
        })
    }

    pub fn fail(&self, occurrence: &Occurrence) -> Result<()> {
        self.stop(occurrence, Status::Failed)
    }
    pub fn interrupt(&self, occurrence: &Occurrence) -> Result<()> {
        self.stop(occurrence, Status::Interrupted)
    }
    fn stop(&self, occurrence: &Occurrence, status: Status) -> Result<()> {
        self.transaction(|state| {
            let index = active_index(state, occurrence)?;
            let task = &mut state.tasks[index];
            if task.status != Status::InFlight {
                return Err(SchedulerError::Stale);
            }
            task.status = status;
            Ok(())
        })
    }

    /// Recovery does not automatically replay potentially irreversible effects.
    /// A caller holding the previous claim may explicitly retry the same identity.
    pub fn retry(&self, occurrence: &Occurrence) -> Result<Occurrence> {
        self.transaction(|state| {
            let index = active_index(state, occurrence)?;
            let task = &mut state.tasks[index];
            if !matches!(task.status, Status::Interrupted | Status::Failed) {
                return Err(SchedulerError::Stale);
            }
            if occurrence.attempt >= MAX_ATTEMPTS {
                return Err(SchedulerError::AttemptsExhausted);
            }
            let mut retry = occurrence.clone();
            retry.attempt += 1;
            task.occurrence = Some(retry.clone());
            task.status = Status::InFlight;
            Ok(retry)
        })
    }

    /// Recovered claims can be inspected by the host after a process restart.
    /// Inspection grants no authority and does not re-acquire the work.
    pub fn interrupted(&self) -> Result<Vec<Occurrence>> {
        let state = self.state.lock().map_err(|_| SchedulerError::Unavailable)?;
        Ok(state
            .tasks
            .iter()
            .filter(|t| matches!(t.status, Status::Interrupted | Status::Failed))
            .filter_map(|t| t.occurrence.clone())
            .collect())
    }

    pub fn prepare_fail(&self, occurrence: &Occurrence) -> Result<Prepared<'_, ()>> {
        self.prepare_transaction(|state| {
            let index = active_index(state, occurrence)?;
            if state.tasks[index].status != Status::InFlight {
                return Err(SchedulerError::Stale);
            }
            state.tasks[index].status = Status::Failed;
            Ok(())
        })
    }
    fn prepare_transaction<T>(
        &self,
        change: impl FnOnce(&mut State) -> Result<T>,
    ) -> Result<Prepared<'_, T>> {
        let prior = self
            .state
            .lock()
            .map_err(|_| SchedulerError::Unavailable)?
            .clone();
        let mut next = prior.clone();
        let result = change(&mut next)?;
        let temporary = stage(&self.path, &next)?;
        Ok(Prepared {
            scheduler: self,
            prior,
            next,
            result: Some(result),
            temporary,
        })
    }

    fn transaction<T>(&self, change: impl FnOnce(&mut State) -> Result<T>) -> Result<T> {
        let mut state = self.state.lock().map_err(|_| SchedulerError::Unavailable)?;
        let mut next = state.clone();
        let result = change(&mut next)?;
        if next == *state {
            return Ok(result);
        }
        // No state is exposed until staging and atomic replacement succeed.
        persist(&self.path, &next)?;
        *state = next;
        Ok(result)
    }
}

/// Staging performs bounded serialization and fsync without authority locks.
/// Commit is only a snapshot check, atomic rename and in-memory publication;
/// the host calls it under its freshly validated registry/session guards.
#[must_use]
pub struct Prepared<'a, T> {
    scheduler: &'a Scheduler,
    prior: State,
    next: State,
    result: Option<T>,
    temporary: Temporary,
}
impl<'a, T> Prepared<'a, T> {
    pub fn map<U>(mut self, map: impl FnOnce(T) -> U) -> Result<Prepared<'a, U>> {
        let result = map(self.result.take().ok_or(SchedulerError::Unavailable)?);
        Ok(Prepared {
            scheduler: self.scheduler,
            prior: self.prior,
            next: self.next,
            result: Some(result),
            temporary: self.temporary,
        })
    }
    pub fn commit(mut self) -> Result<T> {
        Ok(self.publish()?.finish())
    }
    /// Admission must never wait for a peer transaction's staging/fsync while
    /// the caller holds authorization guards. Failed candidates remain owned by
    /// the caller so their temporary-file cleanup also occurs after the guards.
    pub fn publish(&mut self) -> Result<Published<'a, T>> {
        let mut state = self
            .scheduler
            .state
            .try_lock()
            .map_err(|error| match error {
                std::sync::TryLockError::WouldBlock => SchedulerError::Busy,
                std::sync::TryLockError::Poisoned(_) => SchedulerError::Unavailable,
            })?;
        if *state != self.prior {
            return Err(SchedulerError::Busy);
        }
        super::registry::atomic_replace_file(&self.temporary.0, &self.scheduler.path)
            .map_err(|_| SchedulerError::Unavailable)?;
        *state = std::mem::take(&mut self.next);
        Ok(Published {
            scheduler: self.scheduler,
            result: self.result.take().ok_or(SchedulerError::Unavailable)?,
        })
    }
}
/// The rename has committed. Finish outside all authorization/resource guards
/// before acknowledging; a directory-sync failure cannot roll back publication.
#[must_use]
pub struct Published<'a, T> {
    scheduler: &'a Scheduler,
    result: T,
}
impl<T> Published<'_, T> {
    pub fn finish(self) -> T {
        sync_parent(&self.scheduler.path);
        self.result
    }
}

fn upsert_state(state: &mut State, owner: &Owner, schedule: Schedule) -> Result<u64> {
    check_owner(state, owner)?;
    let index = state
        .tasks
        .iter()
        .position(|t| t.owner == *owner && t.schedule.task_id == schedule.task_id);
    if index.is_none()
        && (state.tasks.len() >= 256
            || state.tasks.iter().filter(|t| t.owner == *owner).count() >= 16)
    {
        return Err(SchedulerError::Quota);
    }
    let generation = state.next_generation;
    state.next_generation = generation
        .checked_add(1)
        .filter(|n| *n <= SAFE_INTEGER)
        .ok_or(SchedulerError::Quota)?;
    let task = Task {
        owner: owner.clone(),
        schedule,
        generation,
        status: Status::Pending,
        occurrence: None,
    };
    match index {
        Some(index) => state.tasks[index] = task,
        None => state.tasks.push(task),
    }
    Ok(generation)
}

fn cancel_state(state: &mut State, owner: &Owner, task_id: &str) -> Result<bool> {
    check_owner(state, owner)?;
    let before = state.tasks.len();
    state
        .tasks
        .retain(|t| !(t.owner == *owner && t.schedule.task_id == task_id));
    Ok(before != state.tasks.len())
}

fn finish_and_schedule_state(
    state: &mut State,
    occurrence: &Occurrence,
    next: Option<u64>,
) -> Result<Option<u64>> {
    let index = active_index(state, occurrence)?;
    if state.tasks[index].status != Status::InFlight {
        return Err(SchedulerError::Stale);
    }
    let Some(at) = next else {
        state.tasks.remove(index);
        return Ok(None);
    };
    let generation = state.next_generation;
    state.next_generation = generation
        .checked_add(1)
        .filter(|n| *n <= SAFE_INTEGER)
        .ok_or(SchedulerError::Quota)?;
    let task = &mut state.tasks[index];
    task.schedule.next_at_ms = at;
    task.generation = generation;
    task.status = Status::Pending;
    task.occurrence = None;
    Ok(Some(generation))
}

fn defer_retry_state(state: &mut State, occurrence: &Occurrence, next: u64) -> Result<()> {
    let index = active_index(state, occurrence)?;
    let task = &mut state.tasks[index];
    if task.status != Status::InFlight {
        return Err(SchedulerError::Stale);
    }
    if occurrence.attempt >= MAX_ATTEMPTS {
        return Err(SchedulerError::AttemptsExhausted);
    }
    let mut retry = occurrence.clone();
    retry.attempt += 1;
    retry.schedule.next_at_ms = next;
    task.schedule.next_at_ms = next;
    task.occurrence = Some(retry);
    task.status = Status::PendingRetry;
    Ok(())
}

fn active_index(state: &State, occurrence: &Occurrence) -> Result<usize> {
    state
        .tasks
        .iter()
        .position(|task| task.occurrence.as_ref() == Some(occurrence))
        .ok_or(SchedulerError::Stale)
}
fn check_owner(state: &State, owner: &Owner) -> Result<()> {
    if state
        .tasks
        .iter()
        .any(|t| t.owner.plugin_id == owner.plugin_id && t.owner != *owner)
    {
        return Err(SchedulerError::Stale);
    }
    Ok(())
}
fn validate_identifier(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        || matches!(id, "." | "..")
    {
        return Err(SchedulerError::Invalid);
    }
    Ok(())
}
fn validate_time(time: u64) -> Result<()> {
    if time > SAFE_INTEGER {
        return Err(SchedulerError::Invalid);
    }
    Ok(())
}
fn validate_owner(owner: &Owner, require_installed: bool) -> Result<()> {
    validate_identifier(&owner.plugin_id)?;
    if owner.version.len() > 128
        || !super::versions::is_protocol_version(&owner.version)
        || owner.digest.len() != 64
        || !owner
            .digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(SchedulerError::Invalid);
    }
    validate_absolute_path(&owner.root)?;
    match fs::canonicalize(&owner.root) {
        Ok(root) if root == owner.root && root.is_dir() => Ok(()),
        Err(error) if !require_installed && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(SchedulerError::Path),
    }
}
pub(crate) fn validate_schedule(schedule: &Schedule) -> Result<()> {
    validate_identifier(&schedule.task_id)?;
    validate_identifier(&schedule.event_id)?;
    validate_time(schedule.next_at_ms)?;
    if !valid_payload_depth(&schedule.payload, 32) {
        return Err(SchedulerError::Quota);
    }
    // Bound both traversal stack and serialization allocation for host inputs
    // that have not already passed the IPC parser's resource limits.
    serde_json::to_writer(PayloadBudget(16 * 1024), &schedule.payload)
        .map_err(|_| SchedulerError::Quota)
}
fn valid_payload_depth(value: &Value, remaining: usize) -> bool {
    match value {
        Value::Array(values) => {
            remaining > 0 && values.iter().all(|v| valid_payload_depth(v, remaining - 1))
        }
        Value::Object(values) => {
            remaining > 0
                && values
                    .values()
                    .all(|v| valid_payload_depth(v, remaining - 1))
        }
        _ => true,
    }
}
struct PayloadBudget(usize);
impl Write for PayloadBudget {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > self.0 {
            return Err(std::io::Error::other("payload quota"));
        }
        self.0 -= bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
fn validate_state(state: &State) -> Result<()> {
    if state.schema_version != 1 {
        return Err(SchedulerError::UnsupportedSchema);
    }
    if state.next_generation == 0 || state.next_generation > SAFE_INTEGER || state.tasks.len() > 256
    {
        return Err(SchedulerError::Corrupt);
    }
    let mut identities = std::collections::HashSet::new();
    let mut generations = std::collections::HashSet::new();
    let mut occurrences = std::collections::HashSet::new();
    for task in &state.tasks {
        validate_owner(&task.owner, false).map_err(|_| SchedulerError::Corrupt)?;
        validate_schedule(&task.schedule).map_err(|_| SchedulerError::Corrupt)?;
        if task.generation == 0
            || task.generation >= state.next_generation
            || !identities.insert((&task.owner.plugin_id, &task.schedule.task_id))
            || !generations.insert(task.generation)
        {
            return Err(SchedulerError::Corrupt);
        }
        check_owner(state, &task.owner).map_err(|_| SchedulerError::Corrupt)?;
        if state.tasks.iter().filter(|t| t.owner == task.owner).count() > 16 {
            return Err(SchedulerError::Corrupt);
        }
        match (&task.status, &task.occurrence) {
            (Status::Pending, None) => {}
            (
                Status::InFlight | Status::Interrupted | Status::Failed | Status::PendingRetry,
                Some(o),
            ) if o.owner == task.owner
                && o.schedule == task.schedule
                && o.generation == task.generation
                && o.attempt > 0
                && o.attempt <= MAX_ATTEMPTS
                && o.occurrence_id.len() == 32
                && o.occurrence_id
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                && occurrences.insert(&o.occurrence_id) => {}
            _ => return Err(SchedulerError::Corrupt),
        }
    }
    Ok(())
}

fn validate_absolute_path(path: &Path) -> Result<()> {
    if path.as_os_str().len() > 4096 {
        return Err(SchedulerError::Path);
    }
    validate_absolute_no_symlinks(path).map_err(|_| SchedulerError::Path)
}
fn validate_regular_or_missing(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(SchedulerError::Path),
    }
}
fn validate_state_path(path: &Path) -> Result<()> {
    validate_absolute_path(path)?;
    let parent = path.parent().ok_or(SchedulerError::Path)?;
    if !parent.is_dir()
        || parent.canonicalize().map_err(|_| SchedulerError::Path)? != parent
        || !path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|name| validate_identifier(name).is_ok())
    {
        return Err(SchedulerError::Path);
    }
    validate_regular_or_missing(path)
}
fn private_options() -> OpenOptions {
    #[cfg(unix)]
    let mut options = OpenOptions::new();
    #[cfg(not(unix))]
    let options = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    options
}
fn read_state(path: &Path) -> Result<State> {
    let file = match private_options().read(true).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(State::default()),
        Err(_) => return Err(SchedulerError::Unavailable),
    };
    if !file
        .metadata()
        .map_err(|_| SchedulerError::Unavailable)?
        .is_file()
    {
        return Err(SchedulerError::Path);
    }
    let mut bytes = Vec::new();
    file.take(MAX_STATE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| SchedulerError::Unavailable)?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(SchedulerError::Quota);
    }
    serde_json::from_slice(&bytes).map_err(|_| SchedulerError::Corrupt)
}
fn nonce() -> Result<String> {
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| SchedulerError::Entropy)?;
    Ok(nonce.iter().map(|byte| format!("{byte:02x}")).collect())
}
struct Temporary(PathBuf);
impl Temporary {
    fn create(path: PathBuf) -> Result<(File, Self)> {
        let file = private_options()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| SchedulerError::Unavailable)?;
        let temporary = Self(path);
        Ok((file, temporary))
    }
}
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn stage(path: &Path, state: &State) -> Result<Temporary> {
    validate_state_path(path)?;
    let bytes = serde_json::to_vec(state).map_err(|_| SchedulerError::Invalid)?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(SchedulerError::Quota);
    }
    let parent = path.parent().ok_or(SchedulerError::Path)?;
    let (mut file, temporary) =
        Temporary::create(parent.join(format!(".scheduler-{}.tmp", nonce()?)))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| SchedulerError::Unavailable)?;
    validate_state_path(path)?;
    Ok(temporary)
}
fn persist(path: &Path, state: &State) -> Result<()> {
    let temporary = stage(path, state)?;
    super::registry::atomic_replace_file(&temporary.0, path)
        .map_err(|_| SchedulerError::Unavailable)?;
    // Rename is the transaction's commit point. A post-commit directory-sync
    // failure cannot be reported as rollback; do not publish an inconsistent
    // in-memory failure after disk committed. File contents were fsynced above.
    sync_parent(path);

    Ok(())
}

fn sync_parent(_path: &Path) {
    #[cfg(test)]
    SYNC_OBSERVER.with(|observer| {
        if let Some(observer) = observer.borrow().as_ref() {
            observer(_path);
        }
    });
    #[cfg(unix)]
    if let Some(parent) = _path.parent() {
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
    }
}
#[cfg(test)]
thread_local! {
    pub(super) static SYNC_OBSERVER: std::cell::RefCell<Option<Box<dyn Fn(&Path)>>> = Default::default();
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, Scheduler, Owner, Schedule) {
        let root = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("zero-scheduler-fix-{}", nonce().unwrap()));
        fs::create_dir(&root).unwrap();
        let scheduler = Scheduler::open(&root.join("schedules.json")).unwrap();
        let owner = Owner {
            plugin_id: "test.fix".into(),
            version: "1.0.0".into(),
            digest: "ab".repeat(32),
            root: root.clone(),
        };
        let schedule = Schedule {
            task_id: "task".into(),
            event_id: "refresh".into(),
            next_at_ms: 100,
            payload: Value::Null,
        };
        (root, scheduler, owner, schedule)
    }
    #[test]
    fn prepared_publication_syncs_the_renamed_directory_before_acknowledgement() {
        let (root, scheduler, owner, schedule) = fixture();
        let staged = scheduler.prepare_upsert(&owner, schedule).unwrap();
        assert!(!scheduler.path.exists(), "staging must not publish");
        let observed = std::rc::Rc::new(std::cell::Cell::new(false));
        let seen = observed.clone();
        SYNC_OBSERVER.with(|slot| {
            *slot.borrow_mut() = Some(Box::new(move |path| {
                let state = read_state(path).unwrap();
                assert_eq!(state.tasks.len(), 1, "flush must follow rename");
                seen.set(true);
            }))
        });
        let result = staged.commit();
        SYNC_OBSERVER.with(|slot| *slot.borrow_mut() = None);
        assert!(result.is_ok());
        assert!(
            observed.get(),
            "prepared publication omitted parent-directory sync"
        );
        drop(scheduler);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn post_publication_flush_releases_authorization_and_state_guards() {
        let (root, scheduler, owner, schedule) = fixture();
        let authorization = std::sync::Arc::new(Mutex::new(()));
        let observed = std::rc::Rc::new(std::cell::Cell::new(false));
        let mut staged = scheduler.prepare_upsert(&owner, schedule).unwrap();
        let publication = {
            let _authorization = authorization.lock().unwrap();
            staged.publish().unwrap()
        };
        let unlocked = authorization.clone();
        let seen = observed.clone();
        SYNC_OBSERVER.with(|slot| {
            *slot.borrow_mut() = Some(Box::new(move |path| {
                assert!(
                    unlocked.try_lock().is_ok(),
                    "authorization lock spans directory IO"
                );
                assert_eq!(read_state(path).unwrap().tasks.len(), 1);
                seen.set(true);
            }))
        });
        assert!(scheduler.state.try_lock().is_ok());
        assert_eq!(publication.finish(), 1);
        SYNC_OBSERVER.with(|slot| *slot.borrow_mut() = None);
        assert!(observed.get());
        drop(staged);
        let mut staged = scheduler.prepare_cancel(&owner, "task").unwrap();
        let publication = staged.publish().unwrap();
        #[cfg(unix)]
        {
            // Make the post-rename directory sync fail after publication.
            let moved = root.with_extension("moved");
            fs::rename(&root, &moved).unwrap();
            assert!(publication.finish());
            fs::rename(&moved, &root).unwrap();
        }
        #[cfg(not(unix))]
        assert!(publication.finish());
        drop(staged);
        assert!(scheduler.snapshot().unwrap().is_empty());
        drop(scheduler);
        assert!(Scheduler::open(&root.join("schedules.json"))
            .unwrap()
            .snapshot()
            .unwrap()
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn pending_checks_and_noop_transactions_never_republish_the_journal() {
        let (root, scheduler, owner, schedule) = fixture();
        scheduler.upsert(&owner, schedule).unwrap();
        let observed = std::rc::Rc::new(std::cell::Cell::new(0));
        let seen = observed.clone();
        SYNC_OBSERVER
            .with(|slot| *slot.borrow_mut() = Some(Box::new(move |_| seen.set(seen.get() + 1))));
        for wall in [0, 1, 2, 50, 99] {
            assert!(scheduler.claim_due(wall).unwrap().is_none());
        }
        assert!(!scheduler.cancel(&owner, "absent").unwrap());
        SYNC_OBSERVER.with(|slot| *slot.borrow_mut() = None);
        assert_eq!(observed.get(), 0);
        drop(scheduler);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn final_publication_does_not_wait_for_a_held_journal_transaction() {
        use super::super::session::{SessionOwner, Sessions};
        let (root, scheduler, owner, schedule) = fixture();
        let mut prepared = scheduler.prepare_upsert(&owner, schedule).unwrap();
        let mut sessions = Sessions::default();
        let now = std::time::Instant::now();
        let live = SessionOwner {
            plugin_id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
            view_id: "main".into(),
            revision: 1,
            permissions: vec!["background.schedule".into()],
        };
        let info = sessions.issue(live.clone(), now).unwrap();
        let caller = format!("plugin-{}", info.session_id);
        sessions
            .ready(&info.session_id, &caller, info.generation, now)
            .unwrap();
        let request = serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":"r1","sessionId":info.session_id,"generation":info.generation,"method":"schedule.upsert","payload":{"taskId":"task","eventId":"refresh","nextAtMs":100,"payload":null}})).unwrap();
        sessions.begin(&caller, &request, &live, true, now).unwrap();
        let sessions = Mutex::new(sessions);
        let (held_tx, held_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let admitted = std::thread::scope(|scope| {
            let scheduler = &scheduler;
            scope.spawn(move || {
                scheduler
                    .transaction(|state| {
                        state.next_generation += 1; // A legitimate peer mutation holds journal admission.
                        held_tx.send(()).unwrap();
                        release_rx.recv().unwrap();
                        Ok(())
                    })
                    .unwrap()
            });
            held_rx.recv().unwrap();
            let sessions = &sessions;
            let caller = &caller;
            let live = &live;
            let request = &request;
            scope.spawn(move || {
                let authorization = sessions.lock().unwrap();
                let result = authorization.commit_live(caller, request, live, true, now, || {
                    prepared
                        .publish()
                        .map_err(|_| super::super::session::error("schedule.busy"))
                });
                drop(authorization);
                done_tx
                    .send(result.map(|published| published.finish()))
                    .unwrap();
            });
            let result = done_rx.recv_timeout(std::time::Duration::from_millis(150));
            // Exercise the same independent observer used by native workers. A
            // clock-injected expiry must close its session while journal IO is held.
            let mut cleanup_progressed = false;
            tauri::async_runtime::block_on(super::super::background_runtime::watch_until_closed(
                || Some(true),
                || {
                    if let Ok(mut sessions) = sessions.try_lock() {
                        sessions.close_window(caller);
                        cleanup_progressed = true;
                    }
                },
            ));
            let cancelled = sessions
                .try_lock()
                .map(|sessions| {
                    sessions
                        .get(&info.session_id, caller, info.generation)
                        .is_err()
                })
                .unwrap_or(false);
            release_tx.send(()).unwrap();
            (result, cleanup_progressed, cancelled)
        });
        assert!(
            matches!(admitted.0, Ok(Err(_))),
            "publication blocked behind journal IO"
        );
        assert!(admitted.1, "watchdog teardown stalled behind journal IO");
        assert!(admitted.2, "expired session remains authorized");
        drop(scheduler);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn exclusive_stage_collision_never_deletes_another_owners_file() {
        let root = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("zero-scheduler-collision-{}", nonce().unwrap()));
        fs::create_dir(&root).unwrap();
        let path = root.join("existing.tmp");
        fs::write(&path, b"owned elsewhere").unwrap();
        assert!(Temporary::create(path.clone()).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"owned elsewhere");
        fs::remove_dir_all(root).unwrap();
    }
}
