use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::contracts::{PluginHealth, PluginPermission, PluginRecord, PluginRuntime};

#[derive(Debug, Clone, PartialEq)]
pub struct PluginEntrypointExecutionRequest {
    pub record: PluginRecord,
    pub args: Vec<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginEntrypointExecutionResult {
    pub status_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

pub fn execute_plugin_entrypoint(
    request: PluginEntrypointExecutionRequest,
) -> Result<PluginEntrypointExecutionResult, String> {
    validate_execution_policy(&request.record)?;

    let installed_path = request
        .record
        .installed_path
        .as_ref()
        .ok_or_else(|| "plugin has no installed path".to_string())?;
    let entrypoint = resolve_entrypoint(Path::new(installed_path), &request.record.manifest.main)?;

    if !entrypoint.exists() {
        return Err(format!(
            "plugin entrypoint does not exist: {}",
            entrypoint.display()
        ));
    }

    let mut child = Command::new(&entrypoint)
        .args(&request.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to launch plugin entrypoint: {error}"))?;

    let timeout = Duration::from_millis(request.timeout_ms.max(1));
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("failed to poll plugin process: {error}"))?
            .is_some()
        {
            let output = child
                .wait_with_output()
                .map_err(|error| format!("failed to collect plugin output: {error}"))?;
            return Ok(PluginEntrypointExecutionResult {
                status_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                timed_out: false,
            });
        }

        if started.elapsed() >= timeout {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|error| format!("failed to collect timed-out plugin output: {error}"))?;
            return Ok(PluginEntrypointExecutionResult {
                status_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                timed_out: true,
            });
        }

        std::thread::sleep(Duration::from_millis(10));
    }
}

fn validate_execution_policy(record: &PluginRecord) -> Result<(), String> {
    if !record.enabled || record.health == PluginHealth::Disabled {
        return Err(format!("plugin {} is disabled", record.name));
    }

    if record.health == PluginHealth::Incompatible {
        return Err(format!("plugin {} is incompatible", record.name));
    }

    match record.manifest.runtime {
        Some(PluginRuntime::Binary) | Some(PluginRuntime::Script) => {}
        _ => {
            return Err(format!(
                "unsupported runtime for process execution in plugin {}",
                record.name
            ));
        }
    }

    if !record
        .approved_permissions
        .iter()
        .any(|permission| permission == &PluginPermission::ProcessExecute)
    {
        return Err(format!(
            "plugin {} requires approved process.execute permission",
            record.name
        ));
    }

    Ok(())
}

fn resolve_entrypoint(root: &Path, main: &str) -> Result<PathBuf, String> {
    if !is_safe_package_relative_path(main) {
        return Err("plugin main must be a safe package-relative path".into());
    }

    let mut path = root.to_path_buf();
    for segment in main.split('/') {
        path.push(segment);
    }

    if !path.starts_with(root) {
        return Err("plugin main resolved outside installed plugin path".into());
    }

    Ok(path)
}

fn is_safe_package_relative_path(value: &str) -> bool {
    if value.is_empty() || value.trim() != value || value.contains('\0') {
        return false;
    }

    if value.starts_with('/')
        || value.starts_with('\\')
        || value.contains(':')
        || value.contains('\\')
    {
        return false;
    }

    value
        .split('/')
        .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}
