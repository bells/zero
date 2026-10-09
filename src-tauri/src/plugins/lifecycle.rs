use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};

pub struct LifecycleChange<'a> {
    pub plugin_id: &'a str,
    pub enabled: bool,
    pub reason: &'a str,
    pub previous_version: Option<&'a str>,
}
pub type NativeAdapter = fn(&tauri::AppHandle, &LifecycleChange<'_>) -> Result<(), String>;

#[derive(Default)]
pub struct LifecycleCoordinator {
    gates: Mutex<HashMap<String, Weak<Mutex<()>>>>,
    adapters: Vec<NativeAdapter>,
}
impl LifecycleCoordinator {
    pub fn new(adapters: Vec<NativeAdapter>) -> Self {
        Self {
            adapters,
            ..Self::default()
        }
    }
    pub fn run<T>(
        &self,
        plugin: &str,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.run_many([plugin], operation)
    }

    pub fn run_many<'a, T>(
        &self,
        plugins: impl IntoIterator<Item = &'a str>,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let mut plugins: Vec<_> = plugins.into_iter().collect();
        // Restore shares the same gates as individual operations. A canonical
        // order prevents overlapping multi-plugin operations from deadlocking.
        plugins.sort_unstable();
        plugins.dedup();
        let gates = {
            let mut gates = self
                .gates
                .lock()
                .map_err(|_| "lifecycle gate lock poisoned")?;
            gates.retain(|_, value| value.strong_count() > 0);
            plugins
                .into_iter()
                .map(|plugin| {
                    if let Some(gate) = gates.get(plugin).and_then(Weak::upgrade) {
                        gate
                    } else {
                        let gate = Arc::new(Mutex::new(()));
                        gates.insert(plugin.into(), Arc::downgrade(&gate));
                        gate
                    }
                })
                .collect::<Vec<_>>()
        };
        let _guards = gates
            .iter()
            .map(|gate| gate.lock().map_err(|_| "plugin operation lock poisoned"))
            .collect::<Result<Vec<_>, _>>()?;
        operation()
    }
    pub fn changed(
        &self,
        app: &tauri::AppHandle,
        change: LifecycleChange<'_>,
    ) -> Result<(), String> {
        let mut diagnostic = crate::services::diagnostics::Operation::new(None, "lifecycle");
        let result = (|| {
            for adapter in &self.adapters {
                adapter(app, &change)?;
            }
            Ok(())
        })();
        diagnostic.finish(&result);
        result
    }
}

pub fn changed(
    app: &tauri::AppHandle,
    plugin: &str,
    enabled: bool,
    reason: &str,
    previous_version: Option<&str>,
) -> Result<(), String> {
    use tauri::Manager;
    app.state::<LifecycleCoordinator>().changed(
        app,
        LifecycleChange {
            plugin_id: plugin,
            enabled,
            reason,
            previous_version,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conflicting_operations_are_serialized_and_failed_operations_release_the_gate() {
        let coordinator = Arc::new(LifecycleCoordinator::default());
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let coordinator = coordinator.clone();
                let active = active.clone();
                std::thread::spawn(move || {
                    coordinator
                        .run("notes", || {
                            assert_eq!(active.fetch_add(1, std::sync::atomic::Ordering::SeqCst), 0);
                            std::thread::sleep(std::time::Duration::from_millis(2));
                            active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                            Ok(())
                        })
                        .unwrap();
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        assert!(coordinator
            .run::<()>("notes", || Err("failed".into()))
            .is_err());
        assert!(coordinator.run("notes", || Ok(())).is_ok());
    }

    #[test]
    fn restore_holds_all_plugin_gates_until_native_effects_finish() {
        use std::sync::mpsc;
        use std::time::Duration;
        let coordinator = Arc::new(LifecycleCoordinator::default());
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let restore_coordinator = coordinator.clone();
        let restore = std::thread::spawn(move || {
            restore_coordinator
                .run_many(["paper", "snap", "paper"], || {
                    entered_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(2)).unwrap();
                    Ok(())
                })
                .unwrap();
        });
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // Unrelated plugins stay usable while restore is awaiting an adapter.
        coordinator.run("notes", || Ok(())).unwrap();
        let (disabled_tx, disabled_rx) = mpsc::channel();
        let disable_coordinator = coordinator.clone();
        let disable = std::thread::spawn(move || {
            disable_coordinator
                .run("snap", || {
                    disabled_tx.send(()).unwrap();
                    Ok(())
                })
                .unwrap();
        });
        assert!(disabled_rx.recv_timeout(Duration::from_millis(50)).is_err());
        release_tx.send(()).unwrap();
        disabled_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        restore.join().unwrap();
        disable.join().unwrap();
    }

    #[test]
    fn overlapping_batch_orders_and_failure_do_not_leak_gates() {
        let coordinator = Arc::new(LifecycleCoordinator::default());
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let workers: Vec<_> = [["snap", "paper"], ["paper", "snap"]]
            .into_iter()
            .map(|ids| {
                let coordinator = coordinator.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    for _ in 0..50 {
                        coordinator.run_many(ids, || Ok(())).unwrap();
                    }
                })
            })
            .collect();
        barrier.wait();
        for worker in workers {
            worker.join().unwrap();
        }
        assert!(coordinator
            .run_many::<()>(["snap", "paper"], || Err("adapter failed".into()))
            .is_err());
        coordinator.run("snap", || Ok(())).unwrap();
        coordinator.run("paper", || Ok(())).unwrap();
    }
}
