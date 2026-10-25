//! Registration and persistence form one operation; the previous binding survives failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionError {
    Registration,
    Unregister,
    Persistence,
    Rollback,
}

use std::collections::BTreeSet;

pub trait ShortcutBackend {
    fn register(&mut self, accelerator: &str) -> Result<(), ()>;
    fn unregister(&mut self, accelerator: &str) -> Result<(), ()>;
    fn persist(&mut self) -> Result<(), ()>;
}

pub fn replace_binding(
    backend: &mut impl ShortcutBackend,
    previous: Option<&str>,
    next: Option<&str>,
    enabled: bool,
) -> Result<(), TransactionError> {
    if !enabled {
        if let Some(previous) = previous {
            backend
                .unregister(previous)
                .map_err(|_| TransactionError::Unregister)?;
        }
        return backend.persist().map_err(|_| TransactionError::Persistence);
    }
    if previous == next {
        return backend.persist().map_err(|_| TransactionError::Persistence);
    }
    if let Some(next) = next {
        backend
            .register(next)
            .map_err(|_| TransactionError::Registration)?;
    }
    if let Some(previous) = previous {
        if backend.unregister(previous).is_err() {
            if let Some(next) = next {
                backend
                    .unregister(next)
                    .map_err(|_| TransactionError::Rollback)?;
            }
            return Err(TransactionError::Unregister);
        }
    }
    if backend.persist().is_err() {
        // Restore the old binding before retiring the replacement.
        let restored = previous
            .map(|previous| backend.register(previous))
            .unwrap_or(Ok(()));
        let retired = next.map(|next| backend.unregister(next)).unwrap_or(Ok(()));
        return Err(if restored.is_ok() && retired.is_ok() {
            TransactionError::Persistence
        } else {
            TransactionError::Rollback
        });
    }
    Ok(())
}

/// Tracks every binding owned by the action, including an unpersisted replacement
/// when native rollback fails. Successful unregister is the only removal path.
struct OwnedBackend<'a, B> {
    backend: &'a mut B,
    owned: &'a mut BTreeSet<String>,
}

impl<B: ShortcutBackend> ShortcutBackend for OwnedBackend<'_, B> {
    fn register(&mut self, accelerator: &str) -> Result<(), ()> {
        self.backend.register(accelerator)?;
        self.owned.insert(accelerator.into());
        Ok(())
    }
    fn unregister(&mut self, accelerator: &str) -> Result<(), ()> {
        self.backend.unregister(accelerator)?;
        self.owned.remove(accelerator);
        Ok(())
    }
    fn persist(&mut self) -> Result<(), ()> {
        self.backend.persist()
    }
}

pub fn replace_owned_binding(
    backend: &mut impl ShortcutBackend,
    owned: &mut BTreeSet<String>,
    previous: Option<&str>,
    next: Option<&str>,
    enabled: bool,
) -> Result<(), TransactionError> {
    replace_binding(
        &mut OwnedBackend { backend, owned },
        previous,
        next,
        enabled,
    )
}

pub fn cleanup_owned_bindings(
    backend: &mut impl ShortcutBackend,
    owned: &mut BTreeSet<String>,
    retained: Option<&str>,
) -> Result<(), TransactionError> {
    let unwanted: Vec<_> = owned
        .iter()
        .filter(|key| Some(key.as_str()) != retained)
        .cloned()
        .collect();
    let mut tracked = OwnedBackend { backend, owned };
    let mut failed = false;
    for accelerator in unwanted {
        // Keep trying the other actions even when one OS registration is stuck.
        failed |= tracked.unregister(&accelerator).is_err();
    }
    if failed {
        Err(TransactionError::Unregister)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    struct MemoryBackend {
        bindings: BTreeSet<String>,
        persisted: bool,
        fail_register: Option<String>,
        fail_unregister: BTreeSet<String>,
        fail_save: bool,
    }

    impl MemoryBackend {
        fn active() -> Self {
            Self {
                bindings: BTreeSet::from(["Alt+A".into()]),
                persisted: false,
                fail_register: None,
                fail_unregister: BTreeSet::new(),
                fail_save: false,
            }
        }
    }

    impl ShortcutBackend for MemoryBackend {
        fn register(&mut self, key: &str) -> Result<(), ()> {
            if self.fail_register.as_deref() == Some(key) {
                return Err(());
            }
            self.bindings.insert(key.into());
            Ok(())
        }
        fn unregister(&mut self, key: &str) -> Result<(), ()> {
            if self.fail_unregister.contains(key) {
                return Err(());
            }
            self.bindings.remove(key);
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

    #[test]
    fn replacement_becomes_active_and_persistent() {
        let mut backend = MemoryBackend::active();
        replace_binding(&mut backend, Some("Alt+A"), Some("Alt+B"), true).unwrap();
        assert_eq!(backend.bindings, BTreeSet::from(["Alt+B".into()]));
        assert!(backend.persisted);
    }

    #[test]
    fn unavailable_replacement_preserves_old_binding_and_file() {
        let mut backend = MemoryBackend::active();
        backend.fail_register = Some("Alt+B".into());
        assert_eq!(
            replace_binding(&mut backend, Some("Alt+A"), Some("Alt+B"), true),
            Err(TransactionError::Registration)
        );
        assert_eq!(backend.bindings, BTreeSet::from(["Alt+A".into()]));
        assert!(!backend.persisted);
    }

    #[test]
    fn save_failure_restores_old_binding() {
        let mut backend = MemoryBackend::active();
        backend.fail_save = true;
        assert_eq!(
            replace_binding(&mut backend, Some("Alt+A"), Some("Alt+B"), true),
            Err(TransactionError::Persistence)
        );
        assert_eq!(backend.bindings, BTreeSet::from(["Alt+A".into()]));
        assert!(!backend.persisted);
    }

    #[test]
    fn clearing_removes_binding_and_persists() {
        let mut backend = MemoryBackend::active();
        replace_binding(&mut backend, Some("Alt+A"), None, true).unwrap();
        assert!(backend.bindings.is_empty());
        assert!(backend.persisted);
    }

    #[test]
    fn failed_restore_still_retires_the_unpersisted_replacement() {
        let mut backend = MemoryBackend::active();
        backend.fail_save = true;
        backend.fail_register = Some("Alt+A".into());
        assert_eq!(
            replace_binding(&mut backend, Some("Alt+A"), Some("Alt+B"), true),
            Err(TransactionError::Rollback)
        );
        assert!(backend.bindings.is_empty());
        assert!(!backend.persisted);
    }

    #[test]
    fn disabled_edits_persist_without_registration() {
        let mut backend = MemoryBackend::active();
        backend.bindings.clear();
        replace_binding(&mut backend, Some("Alt+A"), Some("Alt+B"), false).unwrap();
        assert!(backend.bindings.is_empty());
        assert!(backend.persisted);
    }
    #[test]
    fn disabled_same_binding_edit_rejects_failed_unregister_before_persistence() {
        let mut backend = MemoryBackend::active();
        backend.fail_unregister.insert("Alt+A".into());
        assert_eq!(
            replace_binding(&mut backend, Some("Alt+A"), Some("Alt+A"), false),
            Err(TransactionError::Unregister)
        );
        assert_eq!(backend.bindings, BTreeSet::from(["Alt+A".into()]));
        assert!(!backend.persisted);
    }

    #[test]
    fn failed_persistence_rollback_tracks_new_residue_until_cleanup_retry_succeeds() {
        let mut backend = MemoryBackend::active();
        let mut owned = backend.bindings.clone();
        backend.fail_save = true;
        backend.fail_unregister.insert("Alt+B".into());
        assert_eq!(
            replace_owned_binding(&mut backend, &mut owned, Some("Alt+A"), Some("Alt+B"), true),
            Err(TransactionError::Rollback)
        );
        assert_eq!(owned, BTreeSet::from(["Alt+A".into(), "Alt+B".into()]));
        assert_eq!(owned, backend.bindings);
        assert_eq!(
            cleanup_owned_bindings(&mut backend, &mut owned, Some("Alt+A")),
            Err(TransactionError::Unregister)
        );
        assert_eq!(owned, backend.bindings);
        backend.fail_unregister.clear();
        cleanup_owned_bindings(&mut backend, &mut owned, Some("Alt+A")).unwrap();
        assert_eq!(owned, BTreeSet::from(["Alt+A".into()]));
        assert_eq!(owned, backend.bindings);
        assert!(!backend.persisted);
    }

    #[test]
    fn failed_old_retirement_and_rollback_keep_both_bindings_for_disable_retry() {
        let mut backend = MemoryBackend::active();
        let mut owned = backend.bindings.clone();
        backend.fail_unregister = BTreeSet::from(["Alt+A".into(), "Alt+B".into()]);
        assert_eq!(
            replace_owned_binding(&mut backend, &mut owned, Some("Alt+A"), Some("Alt+B"), true),
            Err(TransactionError::Rollback)
        );
        assert_eq!(owned, BTreeSet::from(["Alt+A".into(), "Alt+B".into()]));
        assert!(!backend.persisted);
        backend.fail_unregister.remove("Alt+B");
        assert_eq!(
            cleanup_owned_bindings(&mut backend, &mut owned, None),
            Err(TransactionError::Unregister)
        );
        assert_eq!(owned, BTreeSet::from(["Alt+A".into()]));
        assert_eq!(owned, backend.bindings);
        backend.fail_unregister.clear();
        cleanup_owned_bindings(&mut backend, &mut owned, None).unwrap();
        assert!(owned.is_empty());
        assert!(backend.bindings.is_empty());
    }
}
