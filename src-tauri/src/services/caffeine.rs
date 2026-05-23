use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use std::process::Child;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CaffeineSnapshot {
    pub enabled: bool,
    pub started_at_ms: Option<u64>,
    pub message: String,
}

pub struct CaffeineState {
    enabled: Mutex<bool>,
    started_at: Mutex<Option<SystemTime>>,
    #[cfg(target_os = "macos")]
    process: Mutex<Option<Child>>,
}

impl CaffeineState {
    pub fn new() -> Self {
        Self {
            enabled: Mutex::new(false),
            started_at: Mutex::new(None),
            #[cfg(target_os = "macos")]
            process: Mutex::new(None),
        }
    }

    pub fn snapshot(&self) -> Result<CaffeineSnapshot, String> {
        let enabled = *self.enabled.lock().map_err(|e| e.to_string())?;
        let started_at = *self.started_at.lock().map_err(|e| e.to_string())?;

        Ok(CaffeineSnapshot {
            enabled,
            started_at_ms: started_at.and_then(system_time_to_ms),
            message: if enabled {
                "咖啡因模式已开启".into()
            } else {
                "咖啡因模式已关闭".into()
            },
        })
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<CaffeineSnapshot, String> {
        apply_platform_awake(self, enabled)?;

        {
            let mut is_enabled = self.enabled.lock().map_err(|e| e.to_string())?;
            *is_enabled = enabled;
        }

        {
            let mut started_at = self.started_at.lock().map_err(|e| e.to_string())?;
            *started_at = if enabled {
                Some(SystemTime::now())
            } else {
                None
            };
        }

        self.snapshot()
    }
}

#[cfg(target_os = "macos")]
impl Drop for CaffeineState {
    fn drop(&mut self) {
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

#[cfg(target_os = "macos")]
fn apply_platform_awake(state: &CaffeineState, enabled: bool) -> Result<(), String> {
    let mut process = state.process.lock().map_err(|e| e.to_string())?;

    if enabled {
        if process.is_none() {
            let child = std::process::Command::new("caffeinate")
                .args(["-d", "-i"])
                .spawn()
                .map_err(|e| format!("启动 caffeinate 失败: {e}"))?;
            *process = Some(child);
        }
    } else if let Some(mut child) = process.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_platform_awake(_state: &CaffeineState, enabled: bool) -> Result<(), String> {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };

    unsafe {
        let flags = if enabled {
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        } else {
            ES_CONTINUOUS
        };
        SetThreadExecutionState(flags);
    }

    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_platform_awake(_state: &CaffeineState, _enabled: bool) -> Result<(), String> {
    Err("当前平台暂不支持咖啡因模式".into())
}
