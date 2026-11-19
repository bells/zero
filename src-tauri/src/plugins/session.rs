use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use super::protocol::{PluginError, PluginMethod, PluginRequest, PluginSessionInfo, API_VERSION};

pub const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub const MAX_IN_FLIGHT: usize = 32;
pub const REQUEST_DEADLINE: Duration = Duration::from_secs(10);
const EXPORT_REQUEST_DEADLINE: Duration = Duration::from_secs(120);
const TOMBSTONE_TTL: Duration = Duration::from_secs(30);
const MAX_TOMBSTONES: usize = 128;
const MAX_SESSIONS: usize = 32;

#[derive(Debug, Clone)]
pub struct SessionOwner {
    pub plugin_id: String,
    pub version: String,
    pub digest: String,
    pub root: PathBuf,
    pub view_id: String,
    pub revision: u64,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum SessionKind {
    View,
    Background {
        occurrence: super::scheduler::Occurrence,
        main: String,
        started_ms: u64,
    },
}
pub struct Session {
    pub info: PluginSessionInfo,
    pub owner: SessionOwner,
    pub(crate) kind: SessionKind,
    pub window_label: String,
    created: Instant,
    ready: bool,
    in_flight: HashMap<String, Instant>,
    completed: VecDeque<(String, Instant)>,
}

impl Session {
    pub(crate) fn request_deadline(&self, request_id: &str) -> Result<Instant, PluginError> {
        self.in_flight
            .get(request_id)
            .copied()
            .ok_or_else(|| error("request.cancelled"))
    }
}

#[derive(Default)]
pub struct Sessions {
    generation: u64,
    sessions: HashMap<String, Session>,
}

pub fn error(code: &str) -> PluginError {
    PluginError {
        code: code.into(),
        message: code.replace('.', " "),
        retryable: false,
    }
}

impl Sessions {
    pub fn issue(
        &mut self,
        owner: SessionOwner,
        now: Instant,
    ) -> Result<PluginSessionInfo, PluginError> {
        if self.sessions.len() >= MAX_SESSIONS || self.generation >= 9_007_199_254_740_991 {
            return Err(error("session.limit"));
        }
        let mut nonce = [0_u8; 32];
        getrandom::fill(&mut nonce).map_err(|_| error("session.entropy"))?;
        let id: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
        self.generation += 1;
        let info = PluginSessionInfo {
            session_id: id.clone(),
            generation: self.generation,
            plugin_id: owner.plugin_id.clone(),
            plugin_version: owner.version.clone(),
            api_version: API_VERSION.into(),
            surface_id: owner.view_id.clone(),
            registry_revision: owner.revision,
            background: None,
        };
        self.sessions.insert(
            id.clone(),
            Session {
                info: info.clone(),
                kind: SessionKind::View,
                owner,
                window_label: format!("plugin-{id}"),
                created: now,
                ready: false,
                in_flight: HashMap::new(),
                completed: VecDeque::new(),
            },
        );
        Ok(info)
    }

    pub fn issue_background(
        &mut self,
        mut owner: SessionOwner,
        occurrence: super::scheduler::Occurrence,
        main: String,
        started_ms: u64,
        now: Instant,
    ) -> Result<PluginSessionInfo, PluginError> {
        if owner.plugin_id != occurrence.owner.plugin_id
            || owner.version != occurrence.owner.version
            || owner.digest != occurrence.owner.digest
            || owner.root != occurrence.owner.root
            || !owner.permissions.iter().any(|p| p == "background.schedule")
            || !super::protocol::safe_path(&main)
            || !main.ends_with(".js")
            || occurrence.attempt == 0
            || occurrence.attempt > 32
            || occurrence.generation == 0
            || occurrence.generation > 9_007_199_254_740_991
        {
            return Err(error("background.invalid"));
        }
        owner.view_id = format!("background:{}", occurrence.schedule.event_id);
        let info = self.issue(owner, now)?;
        let session = self.sessions.get_mut(&info.session_id).unwrap();
        session.info.background = Some(super::protocol::BackgroundEventContext {
            task_id: occurrence.schedule.task_id.clone(),
            event_id: occurrence.schedule.event_id.clone(),
            occurrence_id: occurrence.occurrence_id.clone(),
            attempt: occurrence.attempt,
            payload: occurrence.schedule.payload.clone(),
            schedule_generation: occurrence.generation,
        });
        session.kind = SessionKind::Background {
            occurrence,
            main,
            started_ms,
        };
        Ok(session.info.clone())
    }

    pub fn background_main(
        &self,
        id: &str,
        caller: &str,
        now: Instant,
    ) -> Result<Option<String>, PluginError> {
        self.asset_owner(id, caller, now)?;
        Ok(
            match &self
                .sessions
                .get(id)
                .ok_or_else(|| error("session.revoked"))?
                .kind
            {
                SessionKind::View => None,
                SessionKind::Background { main, .. } => Some(main.clone()),
            },
        )
    }

    pub fn get(&self, id: &str, caller: &str, generation: u64) -> Result<&Session, PluginError> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| error("session.revoked"))?;
        if let SessionKind::Background { started_ms, .. } = session.kind {
            let now = crate::services::continuous_clock::now_ms()
                .map_err(|_| error("background.clock"))?;
            if now
                .checked_sub(started_ms)
                .is_none_or(|elapsed| elapsed >= 60_000)
            {
                return Err(error("background.timeout"));
            }
        }
        if session.window_label != caller || session.info.generation != generation {
            return Err(error("session.binding"));
        }
        Ok(session)
    }

    pub fn find_view(&self, plugin: &str, view: &str) -> Option<(String, PluginSessionInfo)> {
        self.sessions
            .values()
            .find(|s| {
                matches!(s.kind, SessionKind::View)
                    && s.owner.plugin_id == plugin
                    && s.owner.view_id == view
            })
            .map(|s| (s.window_label.clone(), s.info.clone()))
    }
    pub fn expire_unready(&mut self, id: &str) -> bool {
        if self.sessions.get(id).is_some_and(|s| !s.ready) {
            self.sessions.remove(id);
            true
        } else {
            false
        }
    }

    pub fn asset_owner(
        &self,
        id: &str,
        caller: &str,
        now: Instant,
    ) -> Result<&SessionOwner, PluginError> {
        let generation = self
            .sessions
            .get(id)
            .ok_or_else(|| error("session.revoked"))?
            .info
            .generation;
        let session = self.get(id, caller, generation)?;
        if session.window_label != caller
            || (!session.ready && now.duration_since(session.created) >= Duration::from_secs(5))
        {
            return Err(error("session.binding"));
        }
        Ok(&session.owner)
    }

    pub fn ready(
        &mut self,
        id: &str,
        caller: &str,
        generation: u64,
        now: Instant,
    ) -> Result<PluginSessionInfo, PluginError> {
        let session = self.get(id, caller, generation)?;
        if now.duration_since(session.created) >= Duration::from_secs(5) && !session.ready {
            return Err(error("session.readyTimeout"));
        }
        let session = self.sessions.get_mut(id).unwrap();
        if session.ready {
            return Err(error("session.alreadyReady"));
        }
        session.ready = true;
        Ok(session.info.clone())
    }

    // The caller must supply a fresh registry snapshot, never a WebView's claim.
    pub fn begin(
        &mut self,
        caller: &str,
        request: &PluginRequest,
        live: &SessionOwner,
        enabled: bool,
        now: Instant,
    ) -> Result<PluginMethod, PluginError> {
        let method = request
            .decode_method()
            .map_err(|_| error("request.invalid"))?;
        if serde_json::to_vec(request)
            .map_err(|_| error("request.invalid"))?
            .len()
            > MAX_REQUEST_BYTES
        {
            return Err(error("request.tooLarge"));
        }
        let session = self.get(&request.session_id, caller, request.generation)?;
        if !enabled
            || !session.ready
            || session.owner.plugin_id != live.plugin_id
            || session.owner.version != live.version
            || session.owner.digest != live.digest
            || session.owner.root != live.root
        {
            return Err(error("session.stale"));
        }
        match (&session.kind, &method) {
            (SessionKind::View, PluginMethod::BackgroundComplete(_))
            | (
                SessionKind::Background { .. },
                PluginMethod::ShowMessage(_)
                | PluginMethod::MediaPreview(_)
                | PluginMethod::MediaReleasePreview(_)
                | PluginMethod::MediaExport(_)
                | PluginMethod::WallpaperRecover(_),
            ) => return Err(error("session.kind")),
            _ => {}
        }
        let permission = method.permission();
        if !live.permissions.iter().any(|p| p == permission)
            || !session.owner.permissions.iter().any(|p| p == permission)
        {
            return Err(error("permission.denied"));
        }
        let session = self.sessions.get_mut(&request.session_id).unwrap();
        while session
            .completed
            .front()
            .is_some_and(|(_, at)| now.duration_since(*at) >= TOMBSTONE_TTL)
        {
            session.completed.pop_front();
        }
        if session.in_flight.contains_key(&request.request_id)
            || session
                .completed
                .iter()
                .any(|(id, _)| id == &request.request_id)
        {
            return Err(error("request.duplicate"));
        }
        if session.in_flight.len() >= MAX_IN_FLIGHT {
            return Err(error("request.busy"));
        }
        let budget = match &method {
            PluginMethod::MediaExport(_) => EXPORT_REQUEST_DEADLINE,
            _ => REQUEST_DEADLINE,
        };
        session
            .in_flight
            .insert(request.request_id.clone(), now + budget);
        Ok(method)
    }

    pub fn can_commit(
        &self,
        caller: &str,
        request: &PluginRequest,
        now: Instant,
    ) -> Result<(), PluginError> {
        let session = self.get(&request.session_id, caller, request.generation)?;
        if now >= session.request_deadline(&request.request_id)? {
            return Err(error("request.timeout"));
        }
        Ok(())
    }

    // Call while holding the session mutex so revoke/cancel cannot interleave
    // between final authorization and an irreversible provider side effect.
    pub fn commit<T>(
        &self,
        caller: &str,
        request: &PluginRequest,
        now: Instant,
        operation: impl FnOnce() -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        self.can_commit(caller, request, now)?;
        operation()
    }

    pub fn commit_live<T>(
        &self,
        caller: &str,
        request: &PluginRequest,
        live: &SessionOwner,
        enabled: bool,
        now: Instant,
        operation: impl FnOnce() -> Result<T, PluginError>,
    ) -> Result<T, PluginError> {
        let session = self.get(&request.session_id, caller, request.generation)?;
        if !enabled
            || !session.ready
            || session.owner.plugin_id != live.plugin_id
            || session.owner.version != live.version
            || session.owner.digest != live.digest
            || session.owner.root != live.root
        {
            return Err(error("session.stale"));
        }
        let method = request
            .decode_method()
            .map_err(|_| error("request.invalid"))?;
        match (&session.kind, &method) {
            (SessionKind::View, PluginMethod::BackgroundComplete(_))
            | (
                SessionKind::Background { .. },
                PluginMethod::ShowMessage(_)
                | PluginMethod::MediaPreview(_)
                | PluginMethod::MediaReleasePreview(_)
                | PluginMethod::MediaExport(_)
                | PluginMethod::WallpaperRecover(_),
            ) => return Err(error("session.kind")),
            _ => {}
        }
        let permission = method.permission();
        if !live.permissions.iter().any(|p| p == permission)
            || !session.owner.permissions.iter().any(|p| p == permission)
        {
            return Err(error("permission.denied"));
        }
        self.commit(caller, request, now, operation)
    }

    pub fn finish(
        &mut self,
        caller: &str,
        request: &PluginRequest,
        now: Instant,
    ) -> Result<(), PluginError> {
        self.get(&request.session_id, caller, request.generation)?;
        let session = self.sessions.get_mut(&request.session_id).unwrap();
        request
            .decode_method()
            .map_err(|_| error("request.invalid"))?;
        session.in_flight.remove(&request.request_id);
        // Cancellation can arrive before the async invoke handler is scheduled.
        // Reserve a tombstone even when dispatch has not begun yet.
        if !session
            .completed
            .iter()
            .any(|(id, _)| id == &request.request_id)
        {
            session
                .completed
                .push_back((request.request_id.clone(), now));
            while session.completed.len() > MAX_TOMBSTONES {
                session.completed.pop_front();
            }
        }
        Ok(())
    }

    pub fn revoke(&mut self, plugin_id: &str) -> Vec<String> {
        let mut labels = Vec::new();
        self.sessions.retain(|_, session| {
            if session.owner.plugin_id == plugin_id {
                labels.push(session.window_label.clone());
                false
            } else {
                true
            }
        });
        labels
    }

    pub fn close_window(&mut self, label: &str) {
        self.sessions
            .retain(|_, session| session.window_label != label);
    }
}
