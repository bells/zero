use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AwakeBatteryPolicy {
    pub stop_on_low_battery: bool,
    pub threshold_percent: u8,
    pub stop_on_low_power_mode: bool,
}
impl Default for AwakeBatteryPolicy {
    fn default() -> Self {
        Self {
            stop_on_low_battery: false,
            threshold_percent: 10,
            stop_on_low_power_mode: false,
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PowerSource {
    Battery,
    External,
    Unknown,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PowerCapability {
    Supported,
    Unsupported,
    NoBattery,
    Unknown,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AwakePowerSnapshot {
    pub source: PowerSource,
    pub battery: PowerCapability,
    pub battery_percent: Option<u8>,
    pub low_power_mode_capability: PowerCapability,
    pub low_power_mode: Option<bool>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    Expired,
    LowBattery,
    LowPowerMode,
}
impl AwakePowerSnapshot {
    pub fn unknown() -> Self {
        Self {
            source: PowerSource::Unknown,
            battery: PowerCapability::Unknown,
            battery_percent: None,
            low_power_mode_capability: PowerCapability::Unknown,
            low_power_mode: None,
        }
    }
}
impl AwakeBatteryPolicy {
    pub fn validate(self) -> Result<(), String> {
        if !(10..=90).contains(&self.threshold_percent) || self.threshold_percent % 5 != 0 {
            return Err("invalid_battery_policy".into());
        }
        Ok(())
    }
    pub fn enabled(self) -> bool {
        self.stop_on_low_battery || self.stop_on_low_power_mode
    }
    pub fn manual_override(self, power: &AwakePowerSnapshot) -> bool {
        self.stop_on_low_battery
            && power.source == PowerSource::Battery
            && power.battery == PowerCapability::Supported
            && power
                .battery_percent
                .is_some_and(|p| p <= self.threshold_percent)
    }
    pub fn stop_reason(self, power: &AwakePowerSnapshot, overridden: bool) -> Option<StopReason> {
        if power.source != PowerSource::Battery || power.battery == PowerCapability::NoBattery {
            return None;
        }
        if self.stop_on_low_power_mode && power.low_power_mode == Some(true) {
            return Some(StopReason::LowPowerMode);
        }
        if !overridden && self.manual_override(power) {
            return Some(StopReason::LowBattery);
        }
        None
    }
    pub fn unavailable(self, power: &AwakePowerSnapshot) -> bool {
        self.enabled()
            && power.source != PowerSource::External
            && power.battery != PowerCapability::NoBattery
            && (power.source == PowerSource::Unknown
                || self.stop_on_low_battery && power.battery_percent.is_none()
                || self.stop_on_low_power_mode && power.low_power_mode.is_none())
    }
}

pub fn read_power() -> AwakePowerSnapshot {
    platform::read()
}

#[cfg(any(target_os = "windows", test))]
fn decode_windows_power(ac: u8, flag: u8, percent: u8, mode: u8) -> AwakePowerSnapshot {
    let no_battery = flag != 255 && flag & 128 != 0;
    AwakePowerSnapshot {
        source: match ac {
            0 => PowerSource::Battery,
            1 => PowerSource::External,
            _ => PowerSource::Unknown,
        },
        battery: if no_battery {
            PowerCapability::NoBattery
        } else if flag == 255 {
            PowerCapability::Unknown
        } else {
            PowerCapability::Supported
        },
        battery_percent: (!no_battery && percent <= 100).then_some(percent),
        low_power_mode_capability: PowerCapability::Supported,
        low_power_mode: match mode {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        },
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    pub fn read() -> AwakePowerSnapshot {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut status = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
            return AwakePowerSnapshot::unknown();
        }
        decode_windows_power(
            status.ACLineStatus,
            status.BatteryFlag,
            status.BatteryLifePercent,
            status.SystemStatusFlag,
        )
    }
}
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::c_void;
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPSCopyPowerSourcesInfo() -> *const c_void;
        fn IOPSCopyPowerSourcesList(info: *const c_void) -> *const c_void;
        fn IOPSGetPowerSourceDescription(
            info: *const c_void,
            source: *const c_void,
        ) -> *const c_void;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: *const c_void);
        fn CFArrayGetCount(array: *const c_void) -> isize;
        fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
        fn CFPropertyListCreateData(
            allocator: *const c_void,
            value: *const c_void,
            format: isize,
            options: usize,
            error: *mut *const c_void,
        ) -> *const c_void;
        fn CFDataGetLength(data: *const c_void) -> isize;
        fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
    }
    struct Owned(*const c_void);
    impl Drop for Owned {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) }
            }
        }
    }
    pub fn read() -> AwakePowerSnapshot {
        let mut result = AwakePowerSnapshot::unknown();
        objc2::rc::autoreleasepool(|_| unsafe {
            let process: *mut objc::runtime::Object = msg_send![class!(NSProcessInfo), processInfo];
            let supported: bool = msg_send![process,respondsToSelector:sel!(isLowPowerModeEnabled)];
            if supported {
                let low: bool = msg_send![process, isLowPowerModeEnabled];
                result.low_power_mode = Some(low);
                result.low_power_mode_capability = PowerCapability::Supported;
            } else {
                result.low_power_mode_capability = PowerCapability::Unsupported;
            }
        });
        unsafe {
            let info = Owned(IOPSCopyPowerSourcesInfo());
            if info.0.is_null() {
                return result;
            }
            let list = Owned(IOPSCopyPowerSourcesList(info.0));
            if list.0.is_null() {
                return result;
            }
            result.battery = PowerCapability::NoBattery;
            for index in 0..CFArrayGetCount(list.0) {
                let description =
                    IOPSGetPowerSourceDescription(info.0, CFArrayGetValueAtIndex(list.0, index));
                if description.is_null() {
                    result.battery = PowerCapability::Unknown;
                    continue;
                }
                let data = Owned(CFPropertyListCreateData(
                    std::ptr::null(),
                    description,
                    100,
                    0,
                    std::ptr::null_mut(),
                ));
                if data.0.is_null() {
                    result.battery = PowerCapability::Unknown;
                    continue;
                }
                let size = CFDataGetLength(data.0);
                if !(1..=65536).contains(&size) {
                    continue;
                }
                let bytes = std::slice::from_raw_parts(CFDataGetBytePtr(data.0), size as usize);
                let Ok(plist::Value::Dictionary(dict)) = plist::from_bytes::<plist::Value>(bytes)
                else {
                    result.battery = PowerCapability::Unknown;
                    continue;
                };
                if dict.get("Type").and_then(plist::Value::as_string) != Some("InternalBattery") {
                    continue;
                }
                if dict.get("Is Present").and_then(plist::Value::as_boolean) == Some(false) {
                    continue;
                }
                result.battery = PowerCapability::Supported;
                result.source = match dict
                    .get("Power Source State")
                    .and_then(plist::Value::as_string)
                {
                    Some("AC Power") => PowerSource::External,
                    Some("Battery Power") => PowerSource::Battery,
                    _ => PowerSource::Unknown,
                };
                let current = dict
                    .get("Current Capacity")
                    .and_then(plist::Value::as_unsigned_integer);
                let max = dict
                    .get("Max Capacity")
                    .and_then(plist::Value::as_unsigned_integer);
                result.battery_percent = current
                    .zip(max)
                    .filter(|(c, m)| *m > 0 && c <= m)
                    .map(|(c, m)| ((u128::from(c) * 100) / u128::from(m)) as u8);
                break;
            }
        }
        result
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::*;
    pub fn read() -> AwakePowerSnapshot {
        AwakePowerSnapshot {
            battery: PowerCapability::Unsupported,
            low_power_mode_capability: PowerCapability::Unsupported,
            ..AwakePowerSnapshot::unknown()
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn battery(percent: u8, low: bool) -> AwakePowerSnapshot {
        AwakePowerSnapshot {
            source: PowerSource::Battery,
            battery: PowerCapability::Supported,
            battery_percent: Some(percent),
            low_power_mode_capability: PowerCapability::Supported,
            low_power_mode: Some(low),
        }
    }
    #[test]
    fn rules_use_source_inclusive_threshold_and_scoped_override() {
        let policy = AwakeBatteryPolicy {
            stop_on_low_battery: true,
            threshold_percent: 10,
            stop_on_low_power_mode: true,
        };
        let mut power = battery(10, false);
        assert!(policy.manual_override(&power));
        assert_eq!(
            policy.stop_reason(&power, false),
            Some(StopReason::LowBattery)
        );
        assert_eq!(policy.stop_reason(&power, true), None);
        power.low_power_mode = Some(true);
        assert_eq!(
            policy.stop_reason(&power, true),
            Some(StopReason::LowPowerMode)
        );
        power.source = PowerSource::External;
        assert_eq!(policy.stop_reason(&power, false), None);
        assert!(!policy.manual_override(&power));
        power.source = PowerSource::Unknown;
        assert_eq!(policy.stop_reason(&power, false), None);
        assert!(policy.unavailable(&power));
        power = AwakePowerSnapshot::unknown();
        assert_eq!(policy.stop_reason(&power, false), None);
        assert!(!policy.manual_override(&power));
    }
    #[test]
    fn known_low_power_state_is_enforced_when_battery_details_are_unknown() {
        let policy = AwakeBatteryPolicy {
            stop_on_low_power_mode: true,
            ..Default::default()
        };
        let power = decode_windows_power(0, 255, 255, 1);
        assert_eq!(
            policy.stop_reason(&power, false),
            Some(StopReason::LowPowerMode)
        );
        assert_eq!(
            policy.stop_reason(&power, true),
            Some(StopReason::LowPowerMode)
        );
        assert!(!policy.unavailable(&power));
    }
    #[test]
    fn adapter_unknowns_external_without_charging_and_no_battery_are_distinct() {
        let policy = AwakeBatteryPolicy {
            stop_on_low_battery: true,
            stop_on_low_power_mode: true,
            ..Default::default()
        };
        let external = decode_windows_power(1, 1, 5, 1);
        assert_eq!(external.source, PowerSource::External);
        assert_eq!(policy.stop_reason(&external, false), None);
        assert!(!policy.unavailable(&external));
        let unknown = decode_windows_power(255, 255, 255, 255);
        assert_eq!(unknown.battery_percent, None);
        assert_eq!(unknown.low_power_mode, None);
        assert!(policy.unavailable(&unknown));
        assert!(!policy.manual_override(&unknown));
        let missing = decode_windows_power(0, 128, 255, 1);
        assert_eq!(missing.battery, PowerCapability::NoBattery);
        assert_eq!(policy.stop_reason(&missing, false), None);
        assert!(!policy.unavailable(&missing));
    }
    #[test]
    fn policy_thresholds_are_validated_and_wire_names_are_explicit() {
        for threshold_percent in [10, 25, 90] {
            AwakeBatteryPolicy {
                threshold_percent,
                ..Default::default()
            }
            .validate()
            .unwrap();
        }
        for threshold_percent in [0, 9, 11, 91, 255] {
            assert!(AwakeBatteryPolicy {
                threshold_percent,
                ..Default::default()
            }
            .validate()
            .is_err());
        }
        let value = serde_json::to_value(AwakeBatteryPolicy::default()).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"stop_on_low_battery":false,"threshold_percent":10,"stop_on_low_power_mode":false})
        );
    }
}

// One bounded queue prevents timed-out reads from spawning an unbounded number
// of native workers. A wedged OS read never blocks the lifecycle coordinator.
type PowerReply = std::sync::mpsc::SyncSender<AwakePowerSnapshot>;
pub struct PowerReader {
    worker: std::sync::Mutex<Option<std::sync::mpsc::SyncSender<PowerReply>>>,
    read_native: fn() -> AwakePowerSnapshot,
    timeout: std::time::Duration,
}
impl Default for PowerReader {
    fn default() -> Self {
        Self {
            worker: std::sync::Mutex::new(None),
            read_native: read_power,
            timeout: std::time::Duration::from_secs(2),
        }
    }
}
impl PowerReader {
    pub fn read(&self) -> AwakePowerSnapshot {
        let Ok(mut worker) = self.worker.lock() else {
            return AwakePowerSnapshot::unknown();
        };
        if worker.is_none() {
            let (sender, receiver) =
                std::sync::mpsc::sync_channel::<std::sync::mpsc::SyncSender<AwakePowerSnapshot>>(1);
            let read_native = self.read_native;
            if std::thread::Builder::new()
                .name("zero-awake-power".into())
                .spawn(move || {
                    for reply in receiver {
                        let _ = reply.send(read_native());
                    }
                })
                .is_err()
            {
                return AwakePowerSnapshot::unknown();
            }
            *worker = Some(sender);
        }
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let sent = worker
            .as_ref()
            .is_some_and(|worker| worker.try_send(sender).is_ok());
        drop(worker);
        if !sent {
            return AwakePowerSnapshot::unknown();
        }
        receiver
            .recv_timeout(self.timeout)
            .unwrap_or_else(|_| AwakePowerSnapshot::unknown())
    }
}

#[cfg(test)]
mod reader_tests {
    use super::*;
    static READS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    static RELEASE: std::sync::OnceLock<std::sync::Mutex<std::sync::mpsc::Receiver<()>>> =
        std::sync::OnceLock::new();
    static STARTED: std::sync::OnceLock<std::sync::mpsc::SyncSender<()>> =
        std::sync::OnceLock::new();
    fn slow() -> AwakePowerSnapshot {
        if READS.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0 {
            STARTED.get().unwrap().send(()).unwrap();
            let _ = RELEASE.get().unwrap().lock().unwrap().recv();
        }
        AwakePowerSnapshot::unknown()
    }
    #[test]
    fn timed_out_adapter_reads_remain_unknown_and_share_one_bounded_worker() {
        let (release, release_receiver) = std::sync::mpsc::channel();
        let (started_signal, started_receiver) = std::sync::mpsc::sync_channel(1);
        RELEASE
            .set(std::sync::Mutex::new(release_receiver))
            .unwrap();
        STARTED.set(started_signal).unwrap();
        let reader = PowerReader {
            read_native: slow,
            timeout: std::time::Duration::from_millis(5),
            ..Default::default()
        };
        assert_eq!(reader.read(), AwakePowerSnapshot::unknown());
        started_receiver
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap();
        let started = std::time::Instant::now();
        for _ in 0..10 {
            assert_eq!(reader.read(), AwakePowerSnapshot::unknown());
        }
        assert!(started.elapsed() < std::time::Duration::from_millis(500));
        assert_eq!(READS.load(std::sync::atomic::Ordering::SeqCst), 1);
        drop(reader);
        release.send(()).unwrap();
    }
}
