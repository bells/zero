use super::{screenshot_error, ScreenshotError, ScreenshotStartResult};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

type StartResult = Result<ScreenshotStartResult, ScreenshotError>;
#[derive(Debug, Default)]
pub struct CaptureStarts {
    current: Mutex<Option<Arc<Flight>>>,
}
#[derive(Debug, Default)]
pub struct Flight {
    result: Mutex<Option<StartResult>>,
    ready: Condvar,
}
impl CaptureStarts {
    pub fn claim(&self) -> Result<(Arc<Flight>, bool), ScreenshotError> {
        let mut current = self
            .current
            .lock()
            .map_err(|_| screenshot_error("screenshot.lifecycle", "截图状态暂不可用", true))?;
        if let Some(flight) = current.as_ref() {
            return Ok((flight.clone(), false));
        }
        let flight = Arc::new(Flight::default());
        *current = Some(flight.clone());
        Ok((flight, true))
    }
    pub fn finish(&self, flight: &Arc<Flight>, result: StartResult) {
        if let Ok(mut ready) = flight.result.lock() {
            if ready.is_none() {
                *ready = Some(result);
                flight.ready.notify_all();
            }
        }
        if let Ok(mut current) = self.current.lock() {
            if current
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, flight))
            {
                *current = None;
            }
        }
    }
}
impl Flight {
    pub fn wait(&self) -> StartResult {
        let ready = self
            .result
            .lock()
            .map_err(|_| screenshot_error("screenshot.lifecycle", "截图状态暂不可用", true))?;
        let (ready, _) = self
            .ready
            .wait_timeout_while(ready, Duration::from_secs(20), |result| result.is_none())
            .map_err(|_| screenshot_error("screenshot.lifecycle", "截图状态暂不可用", true))?;
        ready.clone().unwrap_or_else(|| {
            Err(screenshot_error(
                "screenshot.preparing",
                "截图准备超时，请稍后重试",
                true,
            ))
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_menu_shortcut_and_main_share_the_leader_result() {
        let starts = Arc::new(CaptureStarts::default());
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let threads: Vec<_> = (0..3)
            .map(|_| {
                let starts = starts.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let (flight, leader) = starts.claim().unwrap();
                    barrier.wait();
                    if leader {
                        starts.finish(
                            &flight,
                            Ok(ScreenshotStartResult {
                                mode: "custom-overlay".into(),
                                platform: "macOS".into(),
                                action: "ocr".into(),
                                message: String::new(),
                                session_id: Some("leader-generation".into()),
                                capture_window_label: Some("capture".into()),
                            }),
                        );
                    }
                    (leader, flight.wait().unwrap())
                })
            })
            .collect();
        let results: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|(leader, _)| *leader).count(), 1);
        assert!(results.iter().all(|(_, result)| result.action == "ocr"
            && result.session_id.as_deref() == Some("leader-generation")));
    }
    #[test]
    fn repeated_requests_share_one_result_and_old_completion_cannot_release_new_flight() {
        let starts = CaptureStarts::default();
        let (first, leader) = starts.claim().unwrap();
        assert!(leader);
        let (repeated, leader) = starts.claim().unwrap();
        assert!(!leader);
        assert!(Arc::ptr_eq(&first, &repeated));
        starts.finish(
            &first,
            Ok(ScreenshotStartResult {
                mode: "custom-overlay".into(),
                platform: "macOS".into(),
                action: "ocr".into(),
                message: "".into(),
                session_id: Some("generation1".into()),
                capture_window_label: Some("capture".into()),
            }),
        );
        let (next, leader) = starts.claim().unwrap();
        assert!(leader);
        assert_eq!(repeated.wait().unwrap().action, "ocr");
        starts.finish(&first, Err(screenshot_error("old", "old", false)));
        let (same, leader) = starts.claim().unwrap();
        assert!(!leader);
        assert!(Arc::ptr_eq(&same, &next));
    }
}
