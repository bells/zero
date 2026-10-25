use std::sync::{Arc, Mutex};

#[derive(Debug, Default, PartialEq)]
enum PublicationState {
    #[default]
    Available,
    Claimed,
    Consumed,
    Revoked,
}

#[derive(Debug, Clone, Default)]
pub(super) struct OcrAuthority(Arc<Mutex<PublicationState>>);

pub(super) struct OcrPermit {
    authority: Arc<Mutex<PublicationState>>,
    consumed: bool,
}

impl OcrAuthority {
    pub(super) fn revoke(&self) {
        *self.0.lock().unwrap_or_else(|error| error.into_inner()) = PublicationState::Revoked;
    }
    pub(super) fn claim(&self) -> Option<OcrPermit> {
        let mut state = self.0.lock().ok()?;
        if *state != PublicationState::Available {
            return None;
        }
        *state = PublicationState::Claimed;
        Some(OcrPermit {
            authority: self.0.clone(),
            consumed: false,
        })
    }
}
impl OcrPermit {
    pub(super) fn publish<T>(&mut self, publish: impl FnOnce() -> T) -> Option<T> {
        let mut state = self.authority.lock().ok()?;
        if *state != PublicationState::Claimed {
            return None;
        }
        let result = publish();
        *state = PublicationState::Consumed;
        self.consumed = true;
        Some(result)
    }
    #[cfg(test)]
    pub(super) fn consume(mut self) {
        let _ = self.publish(|| ());
    }
}
impl Drop for OcrPermit {
    fn drop(&mut self) {
        if !self.consumed {
            if let Ok(mut state) = self.authority.lock() {
                if *state == PublicationState::Claimed {
                    *state = PublicationState::Available;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clearing_a_session_revokes_a_claim_before_job_publication() {
        let authority = OcrAuthority::default();
        let mut permit = authority.claim().unwrap();
        authority.revoke();
        let mut published = false;
        assert!(permit
            .publish(|| {
                published = true;
            })
            .is_none());
        assert!(!published);
        assert!(authority.claim().is_none());
    }

    #[test]
    fn cloned_session_authority_admits_only_one_ocr_publication() {
        let authority = OcrAuthority::default();
        let session_snapshot = authority.clone();
        let permit = authority.claim().unwrap();
        assert!(session_snapshot.claim().is_none());
        permit.consume();
        assert!(session_snapshot.claim().is_none());
    }

    #[test]
    fn failed_crop_releases_permission_but_a_new_generation_has_independent_authority() {
        let authority = OcrAuthority::default();
        drop(authority.claim().unwrap());
        authority.claim().unwrap().consume();
        assert!(OcrAuthority::default().claim().is_some());
    }
}
