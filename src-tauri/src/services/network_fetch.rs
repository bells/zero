//! Bounded, cancellable metadata requests owned by installed Web tools.
use std::collections::HashMap;
use std::error::Error;
use std::fmt;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::future::{AbortHandle, AbortRegistration, Abortable, BoxFuture};
use reqwest::{Client, Url};
use serde::Serialize;

use crate::plugins::protocol::{NetworkFetchInput, PluginError, PluginRequest};
use crate::plugins::session::{error, SessionOwner};

const MAX_BODY: usize = 512 * 1024;
const MAX_IMAGE_BODY: usize = 25 * 1024 * 1024;
const MAX_URL: usize = 2048;
const MAX_CONTENT_TYPE: usize = 256;
const DEADLINE: Duration = Duration::from_secs(8);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkFetchOutput {
    status: u16,
    content_type: Option<String>,
    body_base64: String,
}

pub struct NetworkImageBytes {
    pub status: u16,
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
}
trait ResponseBody: Send {
    fn chunk(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, PluginError>>;
}
struct TransportResponse {
    status: u16,
    content_type: Option<String>,
    content_length: Option<u64>,
    location: Option<String>,
    body: Box<dyn ResponseBody>,
}
trait Transport: Send + Sync {
    fn get(&self, url: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>>;
}
trait Lookup: Send + Sync {
    fn lookup(&self, host: &str) -> std::io::Result<Vec<SocketAddr>>;
}
struct SystemLookup;
impl Lookup for SystemLookup {
    fn lookup(&self, host: &str) -> std::io::Result<Vec<SocketAddr>> {
        (host, 0)
            .to_socket_addrs()
            .map(|answers| answers.take(65).collect())
    }
}
struct ScopedResolver {
    resource: Arc<RequestResource>,
    lookup: Arc<dyn Lookup>,
    busy: Arc<AtomicBool>,
}
impl ScopedResolver {
    fn new(resource: Arc<RequestResource>, lookup: Arc<dyn Lookup>) -> Self {
        Self {
            resource,
            lookup,
            busy: Arc::new(AtomicBool::new(false)),
        }
    }
}
struct LookupWorker {
    resource: Arc<RequestResource>,
    busy: Arc<AtomicBool>,
}
impl Drop for LookupWorker {
    fn drop(&mut self) {
        self.busy.store(false, Ordering::SeqCst);
    }
}
#[derive(Debug)]
struct DnsEndpointDenied;

impl fmt::Display for DnsEndpointDenied {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("network endpoint denied")
    }
}

impl Error for DnsEndpointDenied {}

impl reqwest::dns::Resolve for ScopedResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let resource = self.resource.clone();
        let lookup = self.lookup.clone();
        let busy = self.busy.clone();
        Box::pin(async move {
            if resource.abort.is_aborted() {
                return Err(std::io::Error::other("request cancelled").into());
            }
            if busy
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                return Err(std::io::Error::other("resolver busy").into());
            }
            let worker = LookupWorker { resource, busy };
            let host = name.as_str().to_owned();
            let answers = tauri::async_runtime::spawn_blocking(move || {
                let _worker = worker;
                if _worker.resource.abort.is_aborted() {
                    return Err(std::io::Error::other("request cancelled"));
                }
                lookup.lookup(&host)
            })
            .await
            .map_err(|_| std::io::Error::other("resolver failed"))??;
            if answers.is_empty()
                || answers.len() > 64
                || answers.iter().any(|answer| {
                    answer.port() != 0
                        || !public_address(answer.ip())
                        || matches!(answer, SocketAddr::V6(address) if address.scope_id() != 0)
                })
            {
                return Err(DnsEndpointDenied.into());
            }
            Ok(Box::new(answers.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            let [a, b, c, _] = address.octets();
            !(matches!(a, 0 | 10 | 127 | 224..=255)
                || a == 100 && (64..=127).contains(&b)
                || a == 169 && b == 254
                || a == 172 && (16..=31).contains(&b)
                || a == 192 && (b == 0 && matches!(c, 0 | 2) || b == 88 && c == 99 || b == 168)
                || a == 198 && (matches!(b, 18 | 19) || b == 51 && c == 100)
                || a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(address) => {
            if let Some(mapped) = address.to_ipv4_mapped() {
                return public_address(IpAddr::V4(mapped));
            }
            let [first, second, ..] = address.segments();
            // Restrict to ordinary global unicast; deny special-use and tunnel
            // ranges rather than letting an approved name route into a private LAN.
            first & 0xe000 == 0x2000
                && !(first == 0x2001 && (second <= 0x01ff || second == 0x0db8))
                && first != 0x2002
                && first != 0x3fff
        }
    }
}
struct HttpsTransport(Client);
impl HttpsTransport {
    fn new(resource: Arc<RequestResource>) -> Result<Self, PluginError> {
        Client::builder()
            .dns_resolver(Arc::new(ScopedResolver::new(
                resource,
                Arc::new(SystemLookup),
            )))
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .referer(false)
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .timeout(DEADLINE)
            .build()
            .map(Self)
            .map_err(|_| error("network.unavailable"))
    }
}
fn retryable_error(code: &str) -> PluginError {
    PluginError {
        retryable: true,
        ..error(code)
    }
}

fn network_error(failure: impl Error + 'static) -> PluginError {
    // Reqwest wraps DNS policy denials and HTTP parser failures.
    let failure: &(dyn Error + 'static) = &failure;
    let mut source = Some(failure);
    while let Some(cause) = source {
        if cause.is::<DnsEndpointDenied>() {
            return error("network.failed");
        }
        if cause
            .downcast_ref::<hyper::Error>()
            .is_some_and(hyper::Error::is_parse)
        {
            return error("network.invalidResponse");
        }
        source = cause.source();
    }
    retryable_error(
        if failure
            .downcast_ref::<reqwest::Error>()
            .is_some_and(reqwest::Error::is_timeout)
        {
            "network.timeout"
        } else {
            "network.failed"
        },
    )
}
impl Transport for HttpsTransport {
    fn get(&self, url: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>> {
        Box::pin(async move {
            let response = self
                .0
                .get(url)
                .header(reqwest::header::ACCEPT_ENCODING, "identity")
                .send()
                .await
                .map_err(network_error)?;
            let header = |name, limit| -> Result<Option<String>, PluginError> {
                response
                    .headers()
                    .get(name)
                    .map(|v| {
                        if v.as_bytes().len() > limit {
                            return Err(error("network.invalidResponse"));
                        }
                        v.to_str()
                            .map(str::to_owned)
                            .map_err(|_| error("network.invalidResponse"))
                    })
                    .transpose()
            };
            Ok(TransportResponse {
                status: response.status().as_u16(),
                content_type: header(reqwest::header::CONTENT_TYPE, MAX_CONTENT_TYPE)?,
                content_length: response.content_length(),
                location: header(reqwest::header::LOCATION, MAX_URL)?,
                body: Box::new(response),
            })
        })
    }
}
impl ResponseBody for reqwest::Response {
    fn chunk(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, PluginError>> {
        Box::pin(async move {
            self.chunk()
                .await
                .map_err(network_error)?
                .map(|chunk| {
                    if chunk.len() > MAX_BODY {
                        Err(error("network.responseTooLarge"))
                    } else {
                        Ok(chunk.to_vec())
                    }
                })
                .transpose()
        })
    }
}

#[derive(Clone, PartialEq, Eq)]
struct InstalledOwner {
    id: String,
    version: String,
    digest: String,
    root: PathBuf,
}
impl From<&SessionOwner> for InstalledOwner {
    fn from(owner: &SessionOwner) -> Self {
        Self {
            id: owner.plugin_id.clone(),
            version: owner.version.clone(),
            digest: owner.digest.clone(),
            root: owner.root.clone(),
        }
    }
}
struct Entry {
    owner: InstalledOwner,
    session_id: String,
    generation: u64,
    request_id: String,
    abort: AbortHandle,
}
#[derive(Default)]
struct Store {
    next: u64,
    shutdown: bool,
    entries: HashMap<u64, Entry>,
}
#[derive(Clone, Default)]
pub struct NetworkFetchState(Arc<Mutex<Store>>);

// The permit remains counted until the aborted future is actually dropped.
// Abort only signals; removing its entry early could admit excess live IO.
struct RequestResource {
    state: Arc<Mutex<Store>>,
    id: u64,
    abort: AbortHandle,
}
impl Drop for RequestResource {
    fn drop(&mut self) {
        if let Ok(mut store) = self.state.lock() {
            store.entries.remove(&self.id);
        }
    }
}
pub struct NetworkAdmission {
    resource: Arc<RequestResource>,
    abort: AbortHandle,
    registration: Option<AbortRegistration>,
    origins: Vec<Url>,
    deadline: Instant,
}
impl Drop for NetworkAdmission {
    fn drop(&mut self) {
        self.abort.abort();
    }
}
impl NetworkFetchState {
    /// Called only inside the live registry -> session admission guard.
    pub fn admit(
        &self,
        owner: &SessionOwner,
        request: &PluginRequest,
        scopes: Vec<String>,
        started: Instant,
    ) -> Result<NetworkAdmission, PluginError> {
        if !owner.permissions.iter().any(|p| p == "network") {
            return Err(error("permission.denied"));
        }
        if scopes.is_empty() || scopes.len() > 32 {
            return Err(error("network.scopeDenied"));
        }
        let origins = scopes
            .iter()
            .map(|scope| {
                if !crate::plugins::protocol::valid_origin(scope) {
                    return Err(error("network.scopeDenied"));
                }
                let url = Url::parse(scope).map_err(|_| error("network.scopeDenied"))?;
                public_domain(&url)?;
                Ok(url)
            })
            .collect::<Result<Vec<_>, PluginError>>()?;
        let deadline = started
            .checked_add(DEADLINE)
            .ok_or_else(|| retryable_error("network.timeout"))?;
        if Instant::now() >= deadline {
            return Err(retryable_error("network.timeout"));
        }
        let owner = InstalledOwner::from(owner);
        let mut store = self.0.lock().map_err(|_| error("network.unavailable"))?;
        if store.shutdown {
            return Err(error("network.unavailable"));
        }
        if store.entries.len() >= 16
            || store.entries.values().filter(|e| e.owner == owner).count() >= 4
        {
            return Err(retryable_error("network.limit"));
        }
        store.next = store
            .next
            .checked_add(1)
            .ok_or_else(|| error("network.limit"))?;
        let id = store.next;
        let (abort, registration) = AbortHandle::new_pair();
        store.entries.insert(
            id,
            Entry {
                owner,
                session_id: request.session_id.clone(),
                generation: request.generation,
                request_id: request.request_id.clone(),
                abort: abort.clone(),
            },
        );
        Ok(NetworkAdmission {
            resource: Arc::new(RequestResource {
                state: self.0.clone(),
                id,
                abort: abort.clone(),
            }),
            abort,
            registration: Some(registration),
            origins,
            deadline,
        })
    }
    pub fn cancel(&self, request: &PluginRequest) {
        self.abort_matching(|entry| {
            entry.session_id == request.session_id
                && entry.generation == request.generation
                && entry.request_id == request.request_id
        });
    }
    pub fn close_window(&self, label: &str) {
        if let Some(id) = label.strip_prefix("plugin-") {
            self.abort_matching(|entry| entry.session_id == id);
        }
    }
    pub fn revoke(&self, plugin: &str) {
        self.abort_matching(|entry| entry.owner.id == plugin);
    }
    pub fn shutdown(&self) {
        if let Ok(mut store) = self.0.lock() {
            store.shutdown = true;
            for entry in store.entries.values() {
                entry.abort.abort();
            }
        }
    }
    fn abort_matching(&self, matches: impl Fn(&Entry) -> bool) {
        if let Ok(store) = self.0.lock() {
            for entry in store.entries.values().filter(|entry| matches(entry)) {
                entry.abort.abort();
            }
        }
    }
}
impl NetworkAdmission {
    pub async fn download_image(&mut self, url: String) -> Result<NetworkImageBytes, PluginError> {
        self.ensure_active()?;
        let transport = HttpsTransport::new(self.resource.clone())?;
        self.download_image_with(url, &transport).await
    }
    async fn download_image_with(
        &mut self,
        url: String,
        transport: &dyn Transport,
    ) -> Result<NetworkImageBytes, PluginError> {
        self.execute_raw_with(
            NetworkFetchInput {
                url,
                method: crate::plugins::protocol::GetMethod::GET,
            },
            transport,
            MAX_IMAGE_BODY,
        )
        .await
    }
    pub fn ensure_active(&self) -> Result<(), PluginError> {
        if self.abort.is_aborted() {
            return Err(error("request.cancelled"));
        }
        if Instant::now() >= self.deadline {
            return Err(retryable_error("network.timeout"));
        }
        Ok(())
    }
    pub async fn execute(
        &mut self,
        input: NetworkFetchInput,
    ) -> Result<NetworkFetchOutput, PluginError> {
        self.ensure_active()?;
        self.execute_with(input, &HttpsTransport::new(self.resource.clone())?)
            .await
    }
    async fn execute_with(
        &mut self,
        input: NetworkFetchInput,
        transport: &dyn Transport,
    ) -> Result<NetworkFetchOutput, PluginError> {
        self.execute_raw_with(input, transport, MAX_BODY)
            .await
            .map(|output| NetworkFetchOutput {
                status: output.status,
                content_type: output.content_type,
                body_base64: STANDARD.encode(output.bytes),
            })
    }
    async fn execute_raw_with(
        &mut self,
        input: NetworkFetchInput,
        transport: &dyn Transport,
        max_bytes: usize,
    ) -> Result<NetworkImageBytes, PluginError> {
        self.ensure_active()?;
        let registration = self
            .registration
            .take()
            .ok_or_else(|| error("request.duplicate"))?;
        let operation = fetch(input, &self.origins, transport, max_bytes);
        match tokio::time::timeout_at(
            tokio::time::Instant::from_std(self.deadline),
            Abortable::new(operation, registration),
        )
        .await
        {
            Ok(Ok(result)) => {
                self.ensure_active()?;
                result
            }
            Ok(Err(_)) => Err(error("request.cancelled")),
            Err(_) => Err(retryable_error("network.timeout")),
        }
    }
}
fn public_domain(url: &Url) -> Result<(), PluginError> {
    match url.host_str() {
        Some(host)
            if host.parse::<std::net::IpAddr>().is_err()
                && !host.starts_with('[')
                && host.contains('.')
                && !host.ends_with('.')
                && !host.ends_with(".localhost")
                && !host.ends_with(".local")
                && !host.ends_with(".internal")
                && host != "localhost"
                && !host.contains('*') =>
        {
            Ok(())
        }
        _ => Err(error("network.scopeDenied")),
    }
}
fn checked_url(value: &str, origins: &[Url]) -> Result<Url, PluginError> {
    if value.len() > MAX_URL
        || value.trim() != value
        || value
            .split("://")
            .nth(1)
            .and_then(|v| v.split(['/', '?', '#']).next())
            .is_some_and(|authority| authority.contains('@'))
    {
        return Err(error("network.urlDenied"));
    }
    let url = Url::parse(value).map_err(|_| error("network.urlDenied"))?;
    if url.as_str().len() > MAX_URL
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !origins.iter().any(|scope| scope.origin() == url.origin())
    {
        return Err(error("network.urlDenied"));
    }
    public_domain(&url)?;
    Ok(url)
}
async fn fetch(
    input: NetworkFetchInput,
    origins: &[Url],
    transport: &dyn Transport,
    max_bytes: usize,
) -> Result<NetworkImageBytes, PluginError> {
    let mut url = checked_url(&input.url, origins)?;
    for redirects in 0..=5 {
        let mut response = transport.get(url.clone()).await?;
        if response
            .content_length
            .is_some_and(|n| n > max_bytes as u64)
        {
            return Err(error("network.responseTooLarge"));
        }
        if response
            .content_type
            .as_ref()
            .is_some_and(|v| v.len() > MAX_CONTENT_TYPE)
            || response
                .location
                .as_ref()
                .is_some_and(|v| v.len() > MAX_URL)
        {
            return Err(error("network.invalidResponse"));
        }
        if matches!(response.status, 301 | 302 | 303 | 307 | 308) {
            if let Some(location) = response.location {
                if redirects == 5 {
                    return Err(error("network.redirectLimit"));
                }
                // Validate the raw authority as well as the resolved URL (Url drops empty userinfo).
                if location.contains("://") {
                    checked_url(&location, origins)?;
                }
                if location.starts_with("//") {
                    checked_url(&format!("https:{location}"), origins)?;
                }
                let target = url
                    .join(&location)
                    .map_err(|_| error("network.urlDenied"))?;
                url = checked_url(target.as_str(), origins)?;
                continue;
            }
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.body.chunk().await? {
            if body.len().saturating_add(chunk.len()) > max_bytes {
                return Err(error("network.responseTooLarge"));
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(NetworkImageBytes {
            status: response.status,
            content_type: response.content_type,
            bytes: body,
        });
    }
    Err(error("network.redirectLimit"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugins::protocol::GetMethod;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    fn owner(id: &str) -> SessionOwner {
        SessionOwner {
            plugin_id: id.into(),
            version: "1.0.0".into(),
            digest: "ab".repeat(32),
            root: std::env::temp_dir().join(id),
            view_id: format!("{id}.main"),
            revision: 1,
            permissions: vec!["network".into()],
        }
    }
    fn request(id: &str) -> PluginRequest {
        serde_json::from_value(serde_json::json!({"protocolVersion":"1.0.0","requestId":id,"sessionId":"session-a","generation":1,"method":"network.fetch","payload":{"url":"https://example.com/data","method":"GET"}})).unwrap()
    }
    fn input(url: &str) -> NetworkFetchInput {
        NetworkFetchInput {
            url: url.into(),
            method: GetMethod::GET,
        }
    }
    fn admit(state: &NetworkFetchState, id: &str) -> NetworkAdmission {
        state
            .admit(
                &owner("test.a"),
                &request(id),
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .unwrap()
    }
    struct Body(VecDeque<Vec<u8>>);
    impl ResponseBody for Body {
        fn chunk(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, PluginError>> {
            Box::pin(async { Ok(self.0.pop_front()) })
        }
    }
    fn response(
        status: u16,
        location: Option<&str>,
        length: Option<u64>,
        chunks: Vec<Vec<u8>>,
    ) -> TransportResponse {
        TransportResponse {
            status,
            content_type: Some("application/json".into()),
            content_length: length,
            location: location.map(str::to_owned),
            body: Box::new(Body(chunks.into())),
        }
    }
    struct Script {
        replies: Mutex<VecDeque<(String, TransportResponse)>>,
        calls: AtomicUsize,
    }
    impl Script {
        fn new(replies: Vec<(&str, TransportResponse)>) -> Self {
            Self {
                replies: Mutex::new(replies.into_iter().map(|(u, r)| (u.into(), r)).collect()),
                calls: AtomicUsize::new(0),
            }
        }
    }
    impl Transport for Script {
        fn get(&self, url: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>> {
            Box::pin(async move {
                self.calls.fetch_add(1, Ordering::SeqCst);
                let (expected, reply) = self
                    .replies
                    .lock()
                    .unwrap()
                    .pop_front()
                    .expect("unexpected network request");
                assert_eq!(url.as_str(), expected);
                Ok(reply)
            })
        }
    }
    fn run<F: std::future::Future>(future: F) -> F::Output {
        tauri::async_runtime::block_on(future)
    }
    fn assert_error(error: PluginError, code: &str, retryable: bool) {
        assert_eq!(error.code, code);
        assert_eq!(error.message, code.replace('.', " "));
        assert_eq!(error.retryable, retryable, "{code}");
    }
    #[test]
    fn exact_origin_and_effective_port_are_checked_before_io() {
        let state = NetworkFetchState::default();
        for url in [
            "http://example.com/data",
            "https://example.com:444/data",
            "https://example.com.evil.org/data",
            "https://sub.example.com/data",
            "https://user@example.com/data",
            "https://example.com/data#fragment",
            "https://127.0.0.1/data",
            "https://localhost/data",
        ] {
            let transport = Script::new(vec![]);
            assert!(
                run(admit(&state, "r").execute_with(input(url), &transport)).is_err(),
                "{url}"
            );
            assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
        }
        let transport = Script::new(vec![(
            "https://example.com/data",
            response(200, None, Some(2), vec![b"{}".to_vec()]),
        )]);
        let output =
            run(admit(&state, "valid")
                .execute_with(input("https://example.com:443/data"), &transport))
            .unwrap();
        assert_eq!(
            serde_json::to_value(output).unwrap(),
            serde_json::json!({"status":200,"contentType":"application/json","bodyBase64":"e30="})
        );
    }
    #[test]
    fn local_ip_wildcard_and_noncanonical_scopes_cannot_be_admitted() {
        let state = NetworkFetchState::default();
        for scope in [
            "http://example.com",
            "https://*.example.com",
            "https://127.0.0.1",
            "https://[::1]",
            "https://localhost",
            "https://host.local",
            "https://intranet",
            "https://example.com/path",
            "https://example.com#x",
        ] {
            assert!(
                state
                    .admit(
                        &owner("test.a"),
                        &request("r"),
                        vec![scope.into()],
                        Instant::now()
                    )
                    .is_err(),
                "{scope}"
            );
        }
    }
    #[test]
    fn redirect_escape_is_refused_before_second_request() {
        let state = NetworkFetchState::default();
        for target in [
            "https://example.com:444/data",
            "https://evil.org/data",
            "http://example.com/data",
            "https://user@example.com/data",
            "https://example.com/data#x",
            "https://127.0.0.1/data",
        ] {
            let transport = Script::new(vec![(
                "https://example.com/data",
                response(302, Some(target), None, vec![]),
            )]);
            assert!(run(admit(&state, "redirect")
                .execute_with(input("https://example.com/data"), &transport))
            .is_err());
            assert_eq!(transport.calls.load(Ordering::SeqCst), 1);
        }
    }
    #[test]
    fn five_relative_redirects_succeed_and_sixth_is_not_requested() {
        let state = NetworkFetchState::default();
        let transport = Script::new(vec![
            (
                "https://example.com/0",
                response(302, Some("/1"), None, vec![]),
            ),
            (
                "https://example.com/1",
                response(307, Some("/2"), None, vec![]),
            ),
            (
                "https://example.com/2",
                response(308, Some("/3"), None, vec![]),
            ),
            (
                "https://example.com/3",
                response(301, Some("/4"), None, vec![]),
            ),
            (
                "https://example.com/4",
                response(303, Some("/5"), None, vec![]),
            ),
            (
                "https://example.com/5",
                response(200, None, None, vec![b"ok".to_vec()]),
            ),
        ]);
        assert!(
            run(admit(&state, "five").execute_with(input("https://example.com/0"), &transport))
                .is_ok()
        );
        let transport = Script::new(
            (0..6)
                .map(|_| {
                    (
                        "https://example.com/data",
                        response(302, Some("/data"), None, vec![]),
                    )
                })
                .collect(),
        );
        assert_eq!(
            run(admit(&state, "six").execute_with(input("https://example.com/data"), &transport))
                .unwrap_err()
                .code,
            "network.redirectLimit"
        );
        assert_eq!(transport.calls.load(Ordering::SeqCst), 6);
    }
    #[test]
    fn declared_and_chunked_body_overflow_and_large_metadata_are_rejected() {
        let state = NetworkFetchState::default();
        let mut large_type = response(200, None, None, vec![]);
        large_type.content_type = Some("a".repeat(257));
        for reply in [
            response(200, None, Some(524289), vec![]),
            response(200, None, None, vec![vec![1; 524288], vec![2]]),
            large_type,
            response(302, Some(&"a".repeat(2049)), None, vec![]),
        ] {
            let transport = Script::new(vec![("https://example.com/data", reply)]);
            assert!(run(admit(&state, "overflow")
                .execute_with(input("https://example.com/data"), &transport))
            .is_err());
        }
        let transport = Script::new(vec![(
            "https://example.com/data",
            response(200, None, Some(524288), vec![vec![0; 524288]]),
        )]);
        let output =
            run(admit(&state, "max").execute_with(input("https://example.com/data"), &transport))
                .unwrap();
        assert!(serde_json::to_vec(&output).unwrap().len() < 1024 * 1024 - 256);
    }

    #[test]
    fn owner_quota_is_identity_scoped_and_drop_releases_capacity() {
        let state = NetworkFetchState::default();
        let mut permits: Vec<_> = (0..4).map(|i| admit(&state, &format!("r{i}"))).collect();
        let failure = state
            .admit(
                &owner("test.a"),
                &request("overflow"),
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .err()
            .unwrap();
        assert_error(failure, "network.limit", true);
        let mut changed = owner("test.a");
        changed.digest = "cd".repeat(32);
        let changed_permit = state
            .admit(
                &changed,
                &request("new"),
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .unwrap();
        state.revoke("test.other");
        assert!(permits[0].ensure_active().is_ok());
        permits.pop();
        let fresh = admit(&state, "fresh");
        state.revoke("test.a");
        assert!(fresh.ensure_active().is_err());
        assert!(changed_permit.ensure_active().is_err());
        drop(permits);
        drop(fresh);
        drop(changed_permit);
        assert!(admit(&state, "recovered").ensure_active().is_ok());
    }
    #[test]
    fn admission_distinguishes_expired_requests_from_permission_denial() {
        let state = NetworkFetchState::default();
        let mut owner = owner("test.a");
        owner.permissions.clear();
        let denied = state
            .admit(
                &owner,
                &request("denied"),
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .err()
            .unwrap();
        assert_error(denied, "permission.denied", false);
        owner.permissions.push("network".into());
        let expired = state
            .admit(
                &owner,
                &request("expired"),
                vec!["https://example.com".into()],
                Instant::now() - DEADLINE,
            )
            .err()
            .unwrap();
        assert_error(expired, "network.timeout", true);
    }
    #[test]
    fn global_quota_and_shutdown_are_bounded() {
        let state = NetworkFetchState::default();
        let mut permits = vec![];
        for owner_index in 0..4 {
            for request_index in 0..4 {
                permits.push(
                    state
                        .admit(
                            &owner(&format!("test.{owner_index}")),
                            &request(&format!("r{owner_index}-{request_index}")),
                            vec!["https://example.com".into()],
                            Instant::now(),
                        )
                        .unwrap(),
                );
            }
        }
        let failure = state
            .admit(
                &owner("test.extra"),
                &request("extra"),
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .err()
            .unwrap();
        assert_error(failure, "network.limit", true);
        permits.pop();
        assert!(state
            .admit(
                &owner("test.extra"),
                &request("extra"),
                vec!["https://example.com".into()],
                Instant::now()
            )
            .is_ok());
        state.shutdown();
        state.shutdown();
        assert!(permits.iter().all(|p| p.ensure_active().is_err()));
        assert!(state
            .admit(
                &owner("test.extra"),
                &request("late"),
                vec!["https://example.com".into()],
                Instant::now()
            )
            .is_err());
    }
    #[test]
    fn pre_poll_cancel_and_window_close_never_start_io_or_cancel_peers() {
        let state = NetworkFetchState::default();
        let mut a = admit(&state, "a");
        let mut b_request = request("b");
        b_request.session_id = "session-b".into();
        let b = state
            .admit(
                &owner("test.b"),
                &b_request,
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .unwrap();
        let mut wrong = request("a");
        wrong.generation = 2;
        state.cancel(&wrong);
        assert!(a.ensure_active().is_ok());
        state.cancel(&request("a"));
        state.cancel(&request("a"));
        let transport = Script::new(vec![]);
        assert_eq!(
            run(a.execute_with(input("https://example.com/data"), &transport))
                .unwrap_err()
                .code,
            "request.cancelled"
        );
        assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
        state.close_window("plugin-session-a");
        assert!(b.ensure_active().is_ok());
        state.close_window("plugin-session-b");
        assert!(b.ensure_active().is_err());
    }
    struct Dropped(Arc<AtomicUsize>);
    impl Drop for Dropped {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    struct Stalled {
        started: Mutex<Option<std::sync::mpsc::Sender<()>>>,
        drops: Arc<AtomicUsize>,
    }
    impl Transport for Stalled {
        fn get(&self, _: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>> {
            Box::pin(async move {
                let _guard = Dropped(self.drops.clone());
                if let Some(started) = self.started.lock().unwrap().take() {
                    started.send(()).unwrap();
                }
                std::future::pending().await
            })
        }
    }
    #[test]
    fn cancellation_drops_pending_io_and_releases_admission() {
        let state = NetworkFetchState::default();
        let (started, ready) = std::sync::mpsc::channel();
        let drops = Arc::new(AtomicUsize::new(0));
        let transport = Stalled {
            started: Mutex::new(Some(started)),
            drops: drops.clone(),
        };
        let mut permit = admit(&state, "pending");
        let task = tauri::async_runtime::spawn(async move {
            permit
                .execute_with(input("https://example.com/data"), &transport)
                .await
        });
        ready.recv_timeout(Duration::from_secs(1)).unwrap();
        state.cancel(&request("pending"));
        assert_error(run(task).unwrap().unwrap_err(), "request.cancelled", false);
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        let _permits: Vec<_> = (0..4)
            .map(|i| admit(&state, &format!("after{i}")))
            .collect();
    }
    #[test]
    fn total_deadline_drops_stalled_io_and_does_not_deliver_late_output() {
        let state = NetworkFetchState::default();
        let drops = Arc::new(AtomicUsize::new(0));
        let transport = Stalled {
            started: Mutex::new(None),
            drops: drops.clone(),
        };
        let mut permit = state
            .admit(
                &owner("test.a"),
                &request("deadline"),
                vec!["https://example.com".into()],
                Instant::now() - DEADLINE + Duration::from_millis(20),
            )
            .unwrap();
        assert_error(
            run(permit.execute_with(input("https://example.com/data"), &transport)).unwrap_err(),
            "network.timeout",
            true,
        );
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        assert_error(permit.ensure_active().unwrap_err(), "network.timeout", true);
    }
    #[test]
    fn non_get_or_caller_supplied_scope_is_rejected_by_the_public_dto() {
        for payload in [
            serde_json::json!({"url":"https://example.com","method":"POST"}),
            serde_json::json!({"url":"https://example.com","method":"GET","allowedOrigins":["https://evil.org"]}),
        ] {
            assert!(serde_json::from_value::<NetworkFetchInput>(payload).is_err());
        }
    }
    struct StalledBody {
        started: Option<std::sync::mpsc::Sender<()>>,
        drops: Arc<AtomicUsize>,
    }
    impl ResponseBody for StalledBody {
        fn chunk(&mut self) -> BoxFuture<'_, Result<Option<Vec<u8>>, PluginError>> {
            Box::pin(async move {
                let _guard = Dropped(self.drops.clone());
                if let Some(started) = self.started.take() {
                    started.send(()).unwrap();
                }
                std::future::pending().await
            })
        }
    }
    #[test]
    fn window_close_aborts_pending_response_body_and_keeps_peer_alive() {
        let state = NetworkFetchState::default();
        let (started, ready) = std::sync::mpsc::channel();
        let drops = Arc::new(AtomicUsize::new(0));
        let mut reply = response(200, None, None, vec![]);
        reply.body = Box::new(StalledBody {
            started: Some(started),
            drops: drops.clone(),
        });
        let transport = Script::new(vec![("https://example.com/data", reply)]);
        let mut permit = admit(&state, "body");
        let mut peer_request = request("peer");
        peer_request.session_id = "session-peer".into();
        let peer = state
            .admit(
                &owner("test.peer"),
                &peer_request,
                vec!["https://example.com".into()],
                Instant::now(),
            )
            .unwrap();
        let task = tauri::async_runtime::spawn(async move {
            permit
                .execute_with(input("https://example.com/data"), &transport)
                .await
        });
        ready.recv_timeout(Duration::from_secs(1)).unwrap();
        state.close_window("plugin-session-a");
        assert_eq!(run(task).unwrap().unwrap_err().code, "request.cancelled");
        assert_eq!(drops.load(Ordering::SeqCst), 1);
        assert!(peer.ensure_active().is_ok());
        let _permits: Vec<_> = (0..4).map(|i| admit(&state, &format!("new{i}"))).collect();
    }
    #[test]
    fn provider_failure_and_panic_release_all_owner_capacity() {
        struct Failing(bool);
        impl Transport for Failing {
            fn get(&self, _: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>> {
                Box::pin(async move {
                    if self.0 {
                        panic!("injected transport panic");
                    }
                    Err(error("network.failed"))
                })
            }
        }
        let state = NetworkFetchState::default();
        for panics in [false, true] {
            let mut permit = admit(&state, "failed");
            let task = tauri::async_runtime::spawn(async move {
                permit
                    .execute_with(input("https://example.com/data"), &Failing(panics))
                    .await
            });
            let result = run(task);
            if panics {
                assert!(result.is_err());
            } else {
                assert_eq!(result.unwrap().unwrap_err().code, "network.failed");
            }
            let permits: Vec<_> = (0..4).map(|i| admit(&state, &format!("new{i}"))).collect();
            drop(permits);
        }
    }
    struct FixedLookup(Vec<SocketAddr>);
    impl Lookup for FixedLookup {
        fn lookup(&self, host: &str) -> std::io::Result<Vec<SocketAddr>> {
            assert_eq!(host, "public-looking.example.com");
            Ok(self.0.clone())
        }
    }
    struct FailedLookup(std::io::ErrorKind);
    impl Lookup for FailedLookup {
        fn lookup(&self, _: &str) -> std::io::Result<Vec<SocketAddr>> {
            Err(std::io::Error::new(self.0, "private resolver detail"))
        }
    }
    fn transport_with_lookup(permit: &NetworkAdmission, lookup: Arc<dyn Lookup>) -> HttpsTransport {
        HttpsTransport(
            Client::builder()
                .https_only(true)
                .no_proxy()
                .dns_resolver(Arc::new(ScopedResolver::new(
                    permit.resource.clone(),
                    lookup,
                )))
                .build()
                .unwrap(),
        )
    }
    fn admit_lookup(state: &NetworkFetchState, id: &str) -> NetworkAdmission {
        state
            .admit(
                &owner("test.a"),
                &request(id),
                vec!["https://public-looking.example.com".into()],
                Instant::now(),
            )
            .unwrap()
    }
    #[test]
    fn transport_lookup_failures_are_sanitized_and_retryable_for_metadata_and_binary() {
        let state = NetworkFetchState::default();
        let url = "https://public-looking.example.com/data";
        for (kind, code) in [
            (std::io::ErrorKind::ConnectionReset, "network.failed"),
            (std::io::ErrorKind::TimedOut, "network.timeout"),
        ] {
            let mut metadata = admit_lookup(&state, "metadata");
            let transport = transport_with_lookup(&metadata, Arc::new(FailedLookup(kind)));
            assert_error(
                run(metadata.execute_with(input(url), &transport)).unwrap_err(),
                code,
                true,
            );

            let mut binary = admit_lookup(&state, "binary");
            let transport = transport_with_lookup(&binary, Arc::new(FailedLookup(kind)));
            assert_error(
                run(binary.download_image_with(url.into(), &transport))
                    .err()
                    .unwrap(),
                code,
                true,
            );
        }
    }
    struct MalformedResponse(&'static [u8]);

    impl Transport for MalformedResponse {
        fn get(&self, url: Url) -> BoxFuture<'_, Result<TransportResponse, PluginError>> {
            use hyper_util::rt::TokioIo;
            use tokio::io::{AsyncReadExt, AsyncWriteExt};

            Box::pin(async move {
                let (client, mut server) = tokio::io::duplex(1024);
                let (mut sender, connection) =
                    hyper::client::conn::http1::handshake(TokioIo::new(client))
                        .await
                        .unwrap();
                let driver = tauri::async_runtime::spawn(connection);
                let request = hyper::Request::builder()
                    .uri(url.as_str())
                    .body(reqwest::Body::default())
                    .unwrap();
                let reply = async move {
                    let mut received = [0; 1024];
                    assert!(server.read(&mut received).await.unwrap() > 0);
                    server.write_all(self.0).await.unwrap();
                };
                let (result, ()) =
                    futures_util::future::join(sender.send_request(request), reply).await;
                let failure = result.err().expect("malformed response must fail to parse");
                assert!(failure.is_parse());
                let _ = driver.await;
                Err(network_error(failure))
            })
        }
    }

    #[test]
    fn malformed_http_status_is_nonretryable_for_metadata() {
        let state = NetworkFetchState::default();
        let url = "https://example.com/data";
        let transport = MalformedResponse(b"HTTP/1.1 abc Invalid\r\n\r\n");
        let failure =
            run(admit(&state, "status").execute_with(input(url), &transport)).unwrap_err();
        assert_error(failure, "network.invalidResponse", false);
    }

    #[test]
    fn malformed_http_header_is_nonretryable_for_binary() {
        let state = NetworkFetchState::default();
        let url = "https://example.com/image";
        let transport = MalformedResponse(b"HTTP/1.1 200 OK\r\nContent-Type image/png\r\n\r\n");
        let failure = run(admit(&state, "header").download_image_with(url.into(), &transport))
            .err()
            .unwrap();
        assert_error(failure, "network.invalidResponse", false);
    }
    #[test]
    fn dns_endpoint_denial_is_nonretryable_after_https_transport_wraps_it() {
        let state = NetworkFetchState::default();
        let url = "https://public-looking.example.com/data";
        let mut permit = admit_lookup(&state, "blocked");
        let lookup = Arc::new(FixedLookup(vec!["127.0.0.1:0".parse().unwrap()]));
        let transport = transport_with_lookup(&permit, lookup);
        let denied = run(permit.execute_with(input(url), &transport)).unwrap_err();
        assert_eq!(denied.code, "network.failed");
        assert!(!denied.retryable);
    }
    fn resolve_answers(
        permit: &NetworkAdmission,
        answers: &[&str],
    ) -> Result<Vec<SocketAddr>, String> {
        use reqwest::dns::Resolve;
        let resolver = ScopedResolver::new(
            permit.resource.clone(),
            Arc::new(FixedLookup(
                answers.iter().map(|ip| ip.parse().unwrap()).collect(),
            )),
        );
        run(resolver.resolve("public-looking.example.com".parse().unwrap()))
            .map(|answers| answers.collect())
            .map_err(|error| error.to_string())
    }
    #[test]
    fn dns_rejects_private_mixed_and_special_use_answers() {
        let state = NetworkFetchState::default();
        let permit = admit(&state, "dns");
        for private in [
            "127.0.0.1:0",
            "10.0.0.1:0",
            "172.16.0.1:0",
            "192.168.1.1:0",
            "169.254.1.1:0",
            "100.64.0.1:0",
            "0.1.2.3:0",
            "224.0.0.1:0",
            "240.0.0.1:0",
            "192.0.2.1:0",
            "198.18.0.1:0",
            "[::]:0",
            "[::1]:0",
            "[fc00::1]:0",
            "[fe80::1]:0",
            "[ff02::1]:0",
            "[::ffff:127.0.0.1]:0",
            "[::ffff:192.168.1.1]:0",
            "[2001:db8::1]:0",
            "[2002:7f00:1::]:0",
            "[3fff::1]:0",
        ] {
            assert!(resolve_answers(&permit, &[private]).is_err(), "{private}");
            assert!(
                resolve_answers(&permit, &["8.8.8.8:0", private]).is_err(),
                "mixed {private}"
            );
        }
        assert!(resolve_answers(&permit, &[]).is_err());
        assert!(resolve_answers(&permit, &vec!["8.8.8.8:0"; 65]).is_err());
    }
    #[test]
    fn native_image_transfer_keeps_binary_bytes_and_does_not_widen_metadata_bridge() {
        let state = NetworkFetchState::default();
        let chunks = vec![vec![71; 256 * 1024]; 3];
        let make = || {
            Script::new(vec![(
                "https://example.com/image",
                response(200, None, Some(768 * 1024), chunks.clone()),
            )])
        };
        let metadata = run(
            admit(&state, "metadata").execute_with(input("https://example.com/image"), &make())
        );
        assert_eq!(metadata.err().unwrap().code, "network.responseTooLarge");
        let image =
            run(admit(&state, "image")
                .download_image_with("https://example.com/image".into(), &make()))
            .unwrap();
        assert_eq!(image.bytes, vec![71; 768 * 1024]);
        assert_eq!(image.status, 200);
        let overflow = Script::new(vec![(
            "https://example.com/image",
            response(200, None, Some(25 * 1024 * 1024 + 1), vec![]),
        )]);
        assert_eq!(
            run(admit(&state, "overflow")
                .download_image_with("https://example.com/image".into(), &overflow))
            .err()
            .unwrap()
            .code,
            "network.responseTooLarge"
        );
        let denied = Script::new(vec![]);
        assert_eq!(
            run(admit(&state, "denied")
                .download_image_with("https://other.example/image".into(), &denied))
            .err()
            .unwrap()
            .code,
            "network.urlDenied"
        );
        assert_eq!(denied.calls.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn dns_returns_only_the_validated_public_socket_addresses_to_connector() {
        let state = NetworkFetchState::default();
        let permit = admit(&state, "dns-public");
        assert_eq!(
            resolve_answers(
                &permit,
                &[
                    "8.8.8.8:0",
                    "1.1.1.1:0",
                    "[2606:4700:4700::1111]:0",
                    "[::ffff:8.8.8.8]:0"
                ]
            )
            .unwrap(),
            vec![
                "8.8.8.8:0".parse::<SocketAddr>().unwrap(),
                "1.1.1.1:0".parse().unwrap(),
                "[2606:4700:4700::1111]:0".parse().unwrap(),
                "[::ffff:8.8.8.8]:0".parse().unwrap()
            ]
        );
    }
    struct BlockedLookup {
        started: std::sync::mpsc::Sender<()>,
        gate: Mutex<std::sync::mpsc::Receiver<()>>,
    }
    impl Lookup for BlockedLookup {
        fn lookup(&self, _: &str) -> std::io::Result<Vec<SocketAddr>> {
            self.started.send(()).unwrap();
            self.gate.lock().unwrap().recv().unwrap();
            Ok(vec!["8.8.8.8:0".parse().unwrap()])
        }
    }
    #[test]
    fn cancelled_system_resolution_keeps_quota_until_bounded_worker_ends() {
        use reqwest::dns::Resolve;
        let state = NetworkFetchState::default();
        let mut permits: Vec<_> = (0..4).map(|i| admit(&state, &format!("dns{i}"))).collect();
        let permit = permits.pop().unwrap();
        let (started, ready) = std::sync::mpsc::channel();
        let (gate, wait) = std::sync::mpsc::channel();
        let resolver = ScopedResolver::new(
            permit.resource.clone(),
            Arc::new(BlockedLookup {
                started,
                gate: Mutex::new(wait),
            }),
        );
        let future = resolver.resolve("public-looking.example.com".parse().unwrap());
        let (abort, registration) = AbortHandle::new_pair();
        let task = tauri::async_runtime::spawn(Abortable::new(future, registration));
        ready.recv_timeout(Duration::from_secs(1)).unwrap();
        state.cancel(&request("dns3"));
        abort.abort();
        assert!(run(task).unwrap().is_err());
        drop(resolver);
        drop(permit);
        assert!(
            state
                .admit(
                    &owner("test.a"),
                    &request("too-early"),
                    vec!["https://example.com".into()],
                    Instant::now()
                )
                .is_err(),
            "uninterruptible lookup must retain owner quota"
        );
        gate.send(()).unwrap();
        let until = Instant::now() + Duration::from_secs(1);
        loop {
            match state.admit(
                &owner("test.a"),
                &request("recovered"),
                vec!["https://example.com".into()],
                Instant::now(),
            ) {
                Ok(_) => break,
                Err(_) if Instant::now() < until => std::thread::yield_now(),
                Err(error) => panic!("resolver leaked quota: {}", error.code),
            }
        }
    }
}
