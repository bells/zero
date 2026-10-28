use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CaffeineSchedule {
    Unlimited,
    Duration { minutes: u64 },
    Until { expires_at_ms: u64 },
}

impl CaffeineSchedule {
    pub fn validate(self, now_ms: u64) -> Result<(), String> {
        match self {
            Self::Duration { minutes } if !(1..=1440).contains(&minutes) => {
                Err("invalid_schedule".into())
            }
            Self::Until { expires_at_ms } => {
                use chrono::{Days, Local, TimeZone};
                let now = i64::try_from(now_ms)
                    .ok()
                    .and_then(|ms| Local.timestamp_millis_opt(ms).single())
                    .ok_or("invalid_schedule")?;
                let latest_date = now
                    .date_naive()
                    .checked_add_days(Days::new(1))
                    .ok_or("invalid_schedule")?;
                let target = i64::try_from(expires_at_ms)
                    .ok()
                    .and_then(|ms| Local.timestamp_millis_opt(ms).single())
                    .ok_or("invalid_schedule")?;
                if expires_at_ms <= now_ms || target.date_naive() > latest_date {
                    return Err("invalid_schedule".into());
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ClockReading {
    pub wall_ms: u64,
    pub continuous_ms: u64,
}
impl ClockReading {
    pub fn now() -> Result<Self, String> {
        let wall_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|d| u64::try_from(d.as_millis()).ok())
            .ok_or("clock_unavailable")?;
        Ok(Self {
            wall_ms,
            continuous_ms: continuous_ms()?,
        })
    }
}

#[cfg(target_os = "macos")]
fn continuous_ms() -> Result<u64, String> {
    #[repr(C)]
    struct Timebase {
        numer: u32,
        denom: u32,
    }
    extern "C" {
        fn mach_continuous_time() -> u64;
        fn mach_timebase_info(info: *mut Timebase) -> i32;
    }
    let mut scale = Timebase { numer: 0, denom: 0 };
    // mach_continuous_time includes system sleep, unlike mach_absolute_time.
    unsafe {
        if mach_timebase_info(&mut scale) != 0 || scale.denom == 0 {
            return Err("clock_unavailable".into());
        }
        u64::try_from(
            u128::from(mach_continuous_time()) * u128::from(scale.numer)
                / u128::from(scale.denom)
                / 1_000_000,
        )
        .map_err(|_| "clock_unavailable".into())
    }
}
#[cfg(target_os = "windows")]
fn continuous_ms() -> Result<u64, String> {
    Ok(unsafe { windows::Win32::System::SystemInformation::GetTickCount64() })
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn continuous_ms() -> Result<u64, String> {
    Err("clock_unsupported".into())
}

#[derive(Debug, Clone, Copy)]
pub struct SessionTiming {
    pub schedule: CaffeineSchedule,
    pub started: ClockReading,
}
impl SessionTiming {
    pub fn new(schedule: CaffeineSchedule, started: ClockReading) -> Result<Self, String> {
        schedule.validate(started.wall_ms)?;
        Ok(Self { schedule, started })
    }
    pub fn elapsed(self, now: ClockReading) -> u64 {
        now.continuous_ms.saturating_sub(self.started.continuous_ms)
    }
    pub fn remaining(self, now: ClockReading) -> Option<u64> {
        match self.schedule {
            CaffeineSchedule::Unlimited => None,
            CaffeineSchedule::Duration { minutes } => {
                Some((minutes * 60_000).saturating_sub(self.elapsed(now)))
            }
            CaffeineSchedule::Until { expires_at_ms } => {
                Some(expires_at_ms.saturating_sub(now.wall_ms))
            }
        }
    }
    pub fn expires_at(self, now: ClockReading) -> Option<u64> {
        match self.schedule {
            CaffeineSchedule::Unlimited => None,
            CaffeineSchedule::Until { expires_at_ms } => Some(expires_at_ms),
            CaffeineSchedule::Duration { .. } => {
                self.remaining(now).and_then(|r| now.wall_ms.checked_add(r))
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wire_and_schedule_boundaries() {
        let now = ClockReading {
            wall_ms: 1_000_000,
            continuous_ms: 100,
        };
        for minutes in [1, 45, 1440] {
            let schedule = CaffeineSchedule::Duration { minutes };
            schedule.validate(now.wall_ms).unwrap();
            assert_eq!(
                serde_json::from_value::<CaffeineSchedule>(serde_json::to_value(schedule).unwrap())
                    .unwrap(),
                schedule
            );
        }
        for minutes in [0, 1441, u64::MAX] {
            assert!(CaffeineSchedule::Duration { minutes }
                .validate(now.wall_ms)
                .is_err());
        }
        for value in [
            serde_json::json!({"kind":"duration","minutes":1.5}),
            serde_json::json!({"kind":"duration","minutes":-1}),
        ] {
            assert!(serde_json::from_value::<CaffeineSchedule>(value).is_err());
        }
        for expires_at_ms in [0, now.wall_ms, u64::MAX] {
            assert!(CaffeineSchedule::Until { expires_at_ms }
                .validate(now.wall_ms)
                .is_err());
        }
    }
    #[test]
    fn clocks_distinguish_wall_adjustment_suspend_and_replacement() {
        let start = ClockReading {
            wall_ms: 1_000_000,
            continuous_ms: 100,
        };
        let duration =
            SessionTiming::new(CaffeineSchedule::Duration { minutes: 1 }, start).unwrap();
        for wall_ms in [0, 9_999_999] {
            assert_eq!(
                duration.remaining(ClockReading {
                    wall_ms,
                    continuous_ms: 30_100
                }),
                Some(30_000)
            );
            assert_eq!(
                duration.remaining(ClockReading {
                    wall_ms,
                    continuous_ms: 90_100
                }),
                Some(0)
            );
        }
        let until = SessionTiming::new(
            CaffeineSchedule::Until {
                expires_at_ms: 1_060_000,
            },
            start,
        )
        .unwrap();
        assert_eq!(
            until.remaining(ClockReading {
                wall_ms: 1_100_000,
                continuous_ms: 101
            }),
            Some(0)
        );
        assert_eq!(
            until.remaining(ClockReading {
                wall_ms: 900_000,
                continuous_ms: 90_100
            }),
            Some(160_000)
        );
        assert_eq!(
            until.elapsed(ClockReading {
                wall_ms: 0,
                continuous_ms: 90_100
            }),
            90_000
        );
    }
    #[test]
    fn native_clock_is_monotonic_and_epoch_is_valid() {
        let first = ClockReading::now().unwrap();
        let next = ClockReading::now().unwrap();
        assert!(next.continuous_ms >= first.continuous_ms);
        assert!(next.wall_ms > 1_000_000);
    }
}
