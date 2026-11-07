use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;

use super::contracts::{
    FileConversionDirection, FileConversionError, FileConversionErrorCode,
    FileConversionJobSnapshot, FileConversionJobState, FileConversionProgress,
    FileConversionProviderId, FileConversionResult, FileConversionStage,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileConversionJobDraft {
    pub id: String,
    pub canonical_source: PathBuf,
    pub final_output: PathBuf,
    pub source_name: String,
    pub size_bytes: u64,
    pub direction: FileConversionDirection,
    pub target_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileConversionJobRecord {
    pub snapshot: FileConversionJobSnapshot,
    pub canonical_source: PathBuf,
    pub final_output: PathBuf,
}

#[derive(Debug, Default)]
pub struct FileConversionQueue {
    revision: u64,
    jobs: Vec<FileConversionJobRecord>,
    pending: VecDeque<String>,
    batch_pending: VecDeque<String>,
    active_job_id: Option<String>,
    started: bool,
}

impl FileConversionQueue {
    pub fn enqueue(
        &mut self,
        draft: FileConversionJobDraft,
        now_ms: u64,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        if draft.id.is_empty() || self.jobs.iter().any(|job| job.snapshot.id == draft.id) {
            return Err(queue_error(
                FileConversionErrorCode::InvalidInput,
                "The conversion job identifier is missing or already exists.",
                false,
            ));
        }
        if self.jobs.iter().any(|job| {
            job.canonical_source == draft.canonical_source
                && job.snapshot.direction == draft.direction
                && is_active_source_state(&job.snapshot.state)
        }) {
            return Err(queue_error(
                FileConversionErrorCode::DuplicateSource,
                "This source file is already queued or running.",
                false,
            ));
        }

        self.revision = self.revision.saturating_add(1);
        let snapshot = FileConversionJobSnapshot {
            queue_revision: self.revision,
            revision: 0,
            id: draft.id.clone(),
            source_path: draft.canonical_source.to_string_lossy().into_owned(),
            source_name: draft.source_name,
            size_bytes: draft.size_bytes,
            direction: draft.direction,
            target_name: draft.target_name,
            provider_id: None,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
            state: FileConversionJobState::Queued,
        };
        self.pending.push_back(draft.id);
        self.jobs.push(FileConversionJobRecord {
            snapshot: snapshot.clone(),
            canonical_source: draft.canonical_source,
            final_output: draft.final_output,
        });
        Ok(snapshot)
    }

    pub fn queue_snapshot(&self) -> super::contracts::FileConversionQueueSnapshot {
        super::contracts::FileConversionQueueSnapshot {
            revision: self.revision,
            jobs: self.snapshots(),
        }
    }

    pub fn bind_pending(
        &mut self,
        capabilities: &super::contracts::FileConversionCapabilitySnapshot,
        now_ms: u64,
    ) -> Vec<FileConversionJobSnapshot> {
        let mut updates = Vec::new();
        for job in &mut self.jobs {
            if !self.pending.contains(&job.snapshot.id)
                || !matches!(job.snapshot.state, FileConversionJobState::Queued)
            {
                continue;
            }
            let capability = capabilities
                .directions
                .iter()
                .find(|entry| entry.direction == job.snapshot.direction);
            let selected = job
                .snapshot
                .provider_id
                .or_else(|| capability.and_then(|entry| entry.selected_provider_id));
            let available = capability.is_some_and(|entry| {
                entry.providers.iter().any(|provider| {
                    Some(provider.id) == selected
                        && matches!(
                            provider.availability,
                            super::contracts::FileConversionProviderAvailability::Available
                        )
                })
            });
            if available && job.snapshot.provider_id.is_none() {
                self.revision = self.revision.saturating_add(1);
                job.snapshot.queue_revision = self.revision;
                job.snapshot.provider_id = selected;
                job.snapshot.updated_at_ms = now_ms;
                job.snapshot.revision = job.snapshot.revision.saturating_add(1);
                updates.push(job.snapshot.clone());
            }
        }
        updates
    }

    pub fn start_bound(
        &mut self,
        capabilities: &super::contracts::FileConversionCapabilitySnapshot,
        now_ms: u64,
    ) -> Option<FileConversionJobSnapshot> {
        let mut remaining = VecDeque::new();
        while let Some(id) = self.pending.pop_front() {
            let eligible = self.jobs.iter().find(|job| job.snapshot.id == id).is_some_and(|job| capabilities.directions.iter().find(|entry| entry.direction == job.snapshot.direction).is_some_and(|entry| entry.providers.iter().any(|provider| Some(provider.id) == job.snapshot.provider_id && matches!(provider.availability, super::contracts::FileConversionProviderAvailability::Available))));
            if eligible {
                self.batch_pending.push_back(id);
            } else {
                remaining.push_back(id);
            }
        }
        self.pending = remaining;
        self.started = true;
        self.advance(now_ms)
    }

    pub fn bind_retry(
        &mut self,
        job_id: &str,
        provider: FileConversionProviderId,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        let job = self.job_mut(job_id)?;
        job.snapshot.provider_id = Some(provider);
        Ok(job.snapshot.clone())
    }

    pub fn start(&mut self, now_ms: u64) -> Option<FileConversionJobSnapshot> {
        self.batch_pending.extend(self.pending.drain(..));
        self.started = true;
        self.advance(now_ms)
    }

    pub fn set_preparing_stage(
        &mut self,
        job_id: &str,
        stage: FileConversionStage,
        now_ms: u64,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        self.require_active(job_id)?;
        if !matches!(
            stage,
            FileConversionStage::Validating | FileConversionStage::WaitingForProvider
        ) {
            return Err(invalid_state(
                "The requested preparation stage is not valid.",
            ));
        }
        let job = self.job_mut(job_id)?;
        if !matches!(job.snapshot.state, FileConversionJobState::Preparing { .. }) {
            return Err(invalid_state(
                "Only a preparing job can change preparation stage.",
            ));
        }
        job.snapshot.state = FileConversionJobState::Preparing { stage };
        job.snapshot.updated_at_ms = now_ms;
        job.snapshot.revision = job.snapshot.revision.saturating_add(1);
        Ok(job.snapshot.clone())
    }

    pub fn mark_running(
        &mut self,
        job_id: &str,
        provider_id: FileConversionProviderId,
        progress: FileConversionProgress,
        now_ms: u64,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        self.require_active(job_id)?;
        validate_progress(&progress)?;
        let job = self.job_mut(job_id)?;
        if !matches!(job.snapshot.state, FileConversionJobState::Preparing { .. }) {
            return Err(invalid_state("Only a preparing job can begin conversion."));
        }
        if job
            .snapshot
            .provider_id
            .is_some_and(|bound| bound != provider_id)
        {
            return Err(invalid_state(
                "A bound job cannot change provider while running.",
            ));
        }
        job.snapshot.provider_id = Some(provider_id);
        job.snapshot.state = FileConversionJobState::Running { progress };
        job.snapshot.updated_at_ms = now_ms;
        job.snapshot.revision = job.snapshot.revision.saturating_add(1);
        Ok(job.snapshot.clone())
    }

    pub fn update_progress(
        &mut self,
        job_id: &str,
        progress: FileConversionProgress,
        now_ms: u64,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        self.require_active(job_id)?;
        validate_progress(&progress)?;
        let job = self.job_mut(job_id)?;
        if !matches!(job.snapshot.state, FileConversionJobState::Running { .. }) {
            return Err(invalid_state("Only a running job can report progress."));
        }
        job.snapshot.state = FileConversionJobState::Running { progress };
        job.snapshot.updated_at_ms = now_ms;
        job.snapshot.revision = job.snapshot.revision.saturating_add(1);
        Ok(job.snapshot.clone())
    }

    pub fn complete(
        &mut self,
        job_id: &str,
        result: FileConversionResult,
        now_ms: u64,
    ) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        self.require_active(job_id)?;
        let completed = {
            let job = self.job_mut(job_id)?;
            if !matches!(job.snapshot.state, FileConversionJobState::Running { .. }) {
                return Err(invalid_state("Only a running job can complete."));
            }
            job.snapshot.state = FileConversionJobState::Completed { result };
            job.snapshot.updated_at_ms = now_ms;
            job.snapshot.revision = job.snapshot.revision.saturating_add(1);
            job.snapshot.clone()
        };
        self.active_job_id = None;
        Ok(self.with_next_snapshot(completed, now_ms))
    }

    pub fn fail(
        &mut self,
        job_id: &str,
        error: FileConversionError,
        now_ms: u64,
    ) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        self.require_active(job_id)?;
        let failed = {
            let job = self.job_mut(job_id)?;
            if !matches!(
                job.snapshot.state,
                FileConversionJobState::Preparing { .. } | FileConversionJobState::Running { .. }
            ) {
                return Err(invalid_state("Only an active job can fail."));
            }
            job.snapshot.state = FileConversionJobState::Failed { error };
            job.snapshot.updated_at_ms = now_ms;
            job.snapshot.revision = job.snapshot.revision.saturating_add(1);
            job.snapshot.clone()
        };
        self.active_job_id = None;
        Ok(self.with_next_snapshot(failed, now_ms))
    }

    pub fn cancel(
        &mut self,
        job_id: &str,
        now_ms: u64,
    ) -> Result<Vec<FileConversionJobSnapshot>, FileConversionError> {
        let is_active = self.active_job_id.as_deref() == Some(job_id);
        let cancelled = {
            let job = self.job_mut(job_id)?;
            if !matches!(
                job.snapshot.state,
                FileConversionJobState::Queued
                    | FileConversionJobState::Preparing { .. }
                    | FileConversionJobState::Running { .. }
            ) {
                return Err(invalid_state("This conversion job cannot be cancelled."));
            }
            job.snapshot.state = FileConversionJobState::Cancelled {
                error: queue_error(
                    FileConversionErrorCode::Cancelled,
                    "The conversion was cancelled.",
                    true,
                ),
            };
            job.snapshot.updated_at_ms = now_ms;
            job.snapshot.revision = job.snapshot.revision.saturating_add(1);
            job.snapshot.clone()
        };
        self.pending.retain(|pending_id| pending_id != job_id);
        self.batch_pending.retain(|pending_id| pending_id != job_id);
        if is_active {
            self.active_job_id = None;
        }
        Ok(if is_active {
            self.with_next_snapshot(cancelled, now_ms)
        } else {
            vec![cancelled]
        })
    }

    pub fn remove(
        &mut self,
        job_id: &str,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        let index = self
            .jobs
            .iter()
            .position(|job| job.snapshot.id == job_id)
            .ok_or_else(unknown_job)?;
        if matches!(
            self.jobs[index].snapshot.state,
            FileConversionJobState::Preparing { .. } | FileConversionJobState::Running { .. }
        ) {
            return Err(invalid_state("An active conversion job cannot be removed."));
        }
        self.pending.retain(|pending_id| pending_id != job_id);
        self.batch_pending.retain(|pending_id| pending_id != job_id);
        self.revision = self.revision.saturating_add(1);
        Ok(self.jobs.remove(index).snapshot)
    }

    pub fn retry(
        &mut self,
        job_id: &str,
        now_ms: u64,
    ) -> Result<FileConversionJobSnapshot, FileConversionError> {
        let snapshot = {
            let job = self.job_mut(job_id)?;
            let retryable = match &job.snapshot.state {
                FileConversionJobState::Failed { error }
                | FileConversionJobState::Cancelled { error } => {
                    error.retryable
                        && !matches!(
                            error.code,
                            FileConversionErrorCode::InvalidInput
                                | FileConversionErrorCode::UnsupportedFormat
                                | FileConversionErrorCode::PasswordRequired
                                | FileConversionErrorCode::InvalidProviderOutput
                                | FileConversionErrorCode::UnsupportedInput
                        )
                }
                _ => false,
            };
            if !retryable {
                return Err(invalid_state(
                    "This conversion job is not eligible for retry.",
                ));
            }
            job.snapshot.state = FileConversionJobState::Queued;
            job.snapshot.updated_at_ms = now_ms;
            job.snapshot.revision = job.snapshot.revision.saturating_add(1);
            job.snapshot.clone()
        };
        self.pending.push_back(job_id.to_string());
        Ok(snapshot)
    }

    pub fn clear_completed(&mut self) -> Vec<FileConversionJobSnapshot> {
        let mut removed = Vec::new();
        self.jobs.retain(|job| {
            if matches!(job.snapshot.state, FileConversionJobState::Completed { .. }) {
                removed.push(job.snapshot.clone());
                false
            } else {
                true
            }
        });
        if !removed.is_empty() {
            self.revision = self.revision.saturating_add(1);
        }
        removed
    }

    pub fn snapshots(&self) -> Vec<FileConversionJobSnapshot> {
        self.jobs.iter().map(|job| job.snapshot.clone()).collect()
    }

    pub fn record(&self, job_id: &str) -> Option<&FileConversionJobRecord> {
        self.jobs.iter().find(|job| job.snapshot.id == job_id)
    }

    pub fn active_job_id(&self) -> Option<&str> {
        self.active_job_id.as_deref()
    }

    pub fn active_sources(&self) -> HashSet<PathBuf> {
        self.jobs
            .iter()
            .filter(|job| is_active_source_state(&job.snapshot.state))
            .map(|job| job.canonical_source.clone())
            .collect()
    }

    fn with_next_snapshot(
        &mut self,
        terminal: FileConversionJobSnapshot,
        now_ms: u64,
    ) -> Vec<FileConversionJobSnapshot> {
        let mut updates = vec![terminal];
        if let Some(next) = self.advance(now_ms) {
            updates.push(next);
        }
        updates
    }

    fn advance(&mut self, now_ms: u64) -> Option<FileConversionJobSnapshot> {
        if !self.started || self.active_job_id.is_some() {
            return None;
        }
        while let Some(job_id) = self.batch_pending.pop_front() {
            let Some(job) = self.jobs.iter_mut().find(|job| job.snapshot.id == job_id) else {
                continue;
            };
            if !matches!(job.snapshot.state, FileConversionJobState::Queued) {
                continue;
            }
            self.revision = self.revision.saturating_add(1);
            job.snapshot.queue_revision = self.revision;
            job.snapshot.state = FileConversionJobState::Preparing {
                stage: FileConversionStage::Validating,
            };
            job.snapshot.updated_at_ms = now_ms;
            job.snapshot.revision = job.snapshot.revision.saturating_add(1);
            self.active_job_id = Some(job_id);
            return Some(job.snapshot.clone());
        }
        self.started = false;
        None
    }

    fn require_active(&self, job_id: &str) -> Result<(), FileConversionError> {
        if self.active_job_id.as_deref() == Some(job_id) {
            Ok(())
        } else if self.jobs.iter().any(|job| job.snapshot.id == job_id) {
            Err(invalid_state("The conversion job is not active."))
        } else {
            Err(unknown_job())
        }
    }

    fn job_mut(
        &mut self,
        job_id: &str,
    ) -> Result<&mut FileConversionJobRecord, FileConversionError> {
        let job = self
            .jobs
            .iter_mut()
            .find(|job| job.snapshot.id == job_id)
            .ok_or_else(unknown_job)?;
        self.revision = self.revision.saturating_add(1);
        job.snapshot.queue_revision = self.revision;
        Ok(job)
    }
}

fn is_active_source_state(state: &FileConversionJobState) -> bool {
    matches!(
        state,
        FileConversionJobState::Queued
            | FileConversionJobState::Preparing { .. }
            | FileConversionJobState::Running { .. }
    )
}

fn validate_progress(progress: &FileConversionProgress) -> Result<(), FileConversionError> {
    if matches!(
        progress,
        FileConversionProgress::Percentage { percent, .. } if *percent > 100
    ) {
        Err(queue_error(
            FileConversionErrorCode::InvalidInput,
            "Provider progress must be between 0 and 100 percent.",
            false,
        ))
    } else {
        Ok(())
    }
}

fn unknown_job() -> FileConversionError {
    queue_error(
        FileConversionErrorCode::UnknownJob,
        "The conversion job was not found.",
        false,
    )
}

fn invalid_state(message: &str) -> FileConversionError {
    queue_error(FileConversionErrorCode::InvalidJobState, message, false)
}

fn queue_error(
    code: FileConversionErrorCode,
    message: &str,
    retryable: bool,
) -> FileConversionError {
    FileConversionError {
        code,
        message: message.into(),
        retryable,
        provider_id: None,
        diagnostic: None,
        quality_issues: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enqueue_waits_for_explicit_start_and_starts_only_one_job() {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("one", "one.pdf"), 10).unwrap();
        queue.enqueue(draft("two", "two.pdf"), 11).unwrap();

        assert!(queue.active_job_id().is_none());
        assert!(queue
            .snapshots()
            .iter()
            .all(|job| matches!(job.state, FileConversionJobState::Queued)));

        let started = queue.start(12).unwrap();
        assert_eq!(started.id, "one");
        assert_eq!(queue.active_job_id(), Some("one"));
        assert!(matches!(
            started.state,
            FileConversionJobState::Preparing {
                stage: FileConversionStage::Validating
            }
        ));
        assert!(matches!(
            queue.snapshots()[1].state,
            FileConversionJobState::Queued
        ));
    }

    #[test]
    fn running_job_accepts_truthful_progress_and_completion() {
        let mut queue = started_queue();
        queue
            .mark_running(
                "one",
                FileConversionProviderId::LibreOffice,
                FileConversionProgress::Percentage {
                    stage: FileConversionStage::Converting,
                    percent: 42,
                },
                20,
            )
            .unwrap();
        queue
            .update_progress(
                "one",
                FileConversionProgress::Indeterminate {
                    stage: FileConversionStage::Finalizing,
                },
                21,
            )
            .unwrap();

        let updates = queue.complete("one", result(), 22).unwrap();
        assert_eq!(updates.len(), 1);
        assert!(matches!(
            updates[0].state,
            FileConversionJobState::Completed { .. }
        ));
        assert!(queue.active_job_id().is_none());
    }

    #[test]
    fn failure_advances_to_the_next_queued_job() {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("one", "one.pdf"), 10).unwrap();
        queue.enqueue(draft("two", "two.pdf"), 11).unwrap();
        queue.start(12).unwrap();

        let updates = queue.fail("one", retryable_failure(), 13).unwrap();

        assert_eq!(updates.len(), 2);
        assert!(matches!(
            updates[0].state,
            FileConversionJobState::Failed { .. }
        ));
        assert_eq!(updates[1].id, "two");
        assert!(matches!(
            updates[1].state,
            FileConversionJobState::Preparing { .. }
        ));
        assert_eq!(queue.active_job_id(), Some("two"));
    }

    #[test]
    fn document_errors_preserve_codes_without_stopping_the_batch() {
        for code in [
            FileConversionErrorCode::OcrRequired,
            FileConversionErrorCode::UnsupportedInput,
            FileConversionErrorCode::ProviderFailed,
            FileConversionErrorCode::Timeout,
        ] {
            let mut queue = FileConversionQueue::default();
            queue.enqueue(draft("one", "one.pdf"), 10).unwrap();
            queue.enqueue(draft("two", "two.pdf"), 11).unwrap();
            queue.start(12).unwrap();
            let mut error = retryable_failure();
            error.code = code;
            error.diagnostic = None;
            let updates = queue.fail("one", error, 13).unwrap();
            assert!(
                matches!(&updates[0].state, FileConversionJobState::Failed { error }
                if error.code == code && error.diagnostic.is_none())
            );
            assert_eq!(queue.active_job_id(), Some("two"));
        }
    }

    #[test]
    fn cancellation_handles_queued_and_active_jobs_without_stopping_the_batch() {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("one", "one.pdf"), 10).unwrap();
        queue.enqueue(draft("two", "two.pdf"), 11).unwrap();
        queue.enqueue(draft("three", "three.pdf"), 12).unwrap();
        queue.start(13).unwrap();
        queue.cancel("two", 14).unwrap();

        let updates = queue.cancel("one", 15).unwrap();

        assert_eq!(updates.len(), 2);
        assert_eq!(updates[1].id, "three");
        assert_eq!(queue.active_job_id(), Some("three"));
        assert!(matches!(
            queue.record("two").unwrap().snapshot.state,
            FileConversionJobState::Cancelled { .. }
        ));
    }

    #[test]
    fn duplicate_active_sources_and_invalid_transitions_are_rejected() {
        let mut queue = started_queue();
        let duplicate = queue.enqueue(draft("copy", "one.pdf"), 20).unwrap_err();
        assert_eq!(duplicate.code, FileConversionErrorCode::DuplicateSource);

        let progress_error = queue
            .mark_running(
                "one",
                FileConversionProviderId::LibreOffice,
                FileConversionProgress::Percentage {
                    stage: FileConversionStage::Converting,
                    percent: 101,
                },
                21,
            )
            .unwrap_err();
        assert_eq!(progress_error.code, FileConversionErrorCode::InvalidInput);

        let inactive_error = queue.update_progress(
            "missing",
            FileConversionProgress::Indeterminate {
                stage: FileConversionStage::Converting,
            },
            22,
        );
        assert_eq!(
            inactive_error.unwrap_err().code,
            FileConversionErrorCode::UnknownJob
        );
    }

    #[test]
    fn retry_remove_and_clear_only_touch_eligible_jobs() {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("failed", "failed.pdf"), 10).unwrap();
        queue.enqueue(draft("queued", "queued.pdf"), 11).unwrap();
        queue.start(12).unwrap();
        queue.fail("failed", retryable_failure(), 13).unwrap();
        queue.cancel("queued", 14).unwrap();

        let retried = queue.retry("failed", 15).unwrap();
        assert!(matches!(retried.state, FileConversionJobState::Queued));
        queue.remove("queued").unwrap();
        queue.start(16).unwrap();
        queue
            .mark_running(
                "failed",
                FileConversionProviderId::LibreOffice,
                FileConversionProgress::Indeterminate {
                    stage: FileConversionStage::Converting,
                },
                17,
            )
            .unwrap();
        queue.complete("failed", result(), 18).unwrap();

        assert_eq!(queue.clear_completed().len(), 1);
        assert!(queue.snapshots().is_empty());
    }

    #[test]
    fn started_batch_freezes_second_job_and_excludes_later_intake() {
        let mut queue = FileConversionQueue::default();
        let mut first = draft("one", "one.docx");
        first.direction = FileConversionDirection::DocxToPdf;
        let mut second = draft("two", "two.docx");
        second.direction = FileConversionDirection::DocxToPdf;
        queue.enqueue(first, 10).unwrap();
        queue.enqueue(second, 10).unwrap();
        let mut capabilities = super::super::capabilities::capability_snapshot_from_providers(
            Vec::new(),
            super::super::provider::ProviderPlatform::Macos,
            10,
        );
        for provider in &mut capabilities.directions[1].providers {
            provider.availability =
                super::super::contracts::FileConversionProviderAvailability::Available;
        }
        let mut prefs = super::super::preferences::FileProviderPreferences::defaults(
            super::super::provider::ProviderPlatform::Macos,
        );
        prefs.docx_to_pdf = Some(FileConversionProviderId::LibreOffice);
        super::super::capabilities::apply_preferences(&mut capabilities, &prefs);
        queue.bind_pending(&capabilities, 11);
        queue.start_bound(&capabilities, 11).unwrap();
        prefs.docx_to_pdf = Some(FileConversionProviderId::MicrosoftWordMacos);
        super::super::capabilities::apply_preferences(&mut capabilities, &prefs);
        queue.bind_pending(&capabilities, 12);
        assert_eq!(
            queue.record("two").unwrap().snapshot.provider_id,
            Some(FileConversionProviderId::LibreOffice)
        );
        let mut future = draft("future", "future.docx");
        future.direction = FileConversionDirection::DocxToPdf;
        queue.enqueue(future, 12).unwrap();
        let updates = queue.fail("one", retryable_failure(), 13).unwrap();
        assert_eq!(updates[1].id, "two");
        queue.fail("two", retryable_failure(), 14).unwrap();
        assert!(queue.active_job_id().is_none());
        assert!(matches!(
            queue.record("future").unwrap().snapshot.state,
            FileConversionJobState::Queued
        ));
        queue.bind_pending(&capabilities, 15);
        assert_eq!(
            queue.start_bound(&capabilities, 15).unwrap().provider_id,
            Some(FileConversionProviderId::MicrosoftWordMacos)
        );
        assert_eq!(
            queue.retry("one", 15).unwrap().provider_id,
            Some(FileConversionProviderId::LibreOffice)
        );
    }

    #[test]
    fn mixed_start_keeps_unavailable_direction_unstarted_without_fallback() {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("pdf", "one.pdf"), 1).unwrap();
        let mut docx = draft("docx", "two.docx");
        docx.direction = FileConversionDirection::DocxToPdf;
        queue.enqueue(docx, 1).unwrap();
        let mut capabilities = super::super::capabilities::capability_snapshot_from_providers(
            Vec::new(),
            super::super::provider::ProviderPlatform::Macos,
            1,
        );
        capabilities.directions[0].providers[0].availability =
            super::super::contracts::FileConversionProviderAvailability::Available;
        capabilities.directions[0].selected_provider_id =
            Some(FileConversionProviderId::ZeroFilePdfToDocx);
        capabilities.directions[0].available = true;
        queue.bind_pending(&capabilities, 2);
        assert_eq!(queue.start_bound(&capabilities, 2).unwrap().id, "pdf");
        assert_eq!(queue.record("docx").unwrap().snapshot.provider_id, None);
        assert!(matches!(
            queue.record("docx").unwrap().snapshot.state,
            FileConversionJobState::Queued
        ));
        queue.fail("pdf", retryable_failure(), 3).unwrap();
        assert!(queue.active_job_id().is_none());
        assert_eq!(queue.record("docx").unwrap().snapshot.provider_id, None);
    }

    #[test]
    fn changing_engine_cannot_retry_invalid_or_password_protected_input() {
        for code in [
            FileConversionErrorCode::InvalidInput,
            FileConversionErrorCode::PasswordRequired,
            FileConversionErrorCode::UnsupportedInput,
        ] {
            let mut queue = started_queue();
            let mut error = retryable_failure();
            error.code = code;
            queue.fail("one", error, 20).unwrap();
            assert!(queue.retry("one", 21).is_err());
        }
    }

    fn started_queue() -> FileConversionQueue {
        let mut queue = FileConversionQueue::default();
        queue.enqueue(draft("one", "one.pdf"), 10).unwrap();
        queue.start(11).unwrap();
        queue
    }

    fn draft(id: &str, source: &str) -> FileConversionJobDraft {
        FileConversionJobDraft {
            id: id.into(),
            canonical_source: PathBuf::from("/tmp").join(source),
            final_output: PathBuf::from("/tmp").join(format!("{id}-converted.docx")),
            source_name: source.into(),
            size_bytes: 100,
            direction: FileConversionDirection::PdfToDocx,
            target_name: format!("{id}-converted.docx"),
        }
    }

    fn result() -> FileConversionResult {
        FileConversionResult {
            output_path: "/tmp/converted.pdf".into(),
            output_name: "converted.pdf".into(),
            size_bytes: 42,
            completed_at_ms: 20,
            provider_id: FileConversionProviderId::LibreOffice,
            provider_origin: crate::services::file::contracts::FileConversionProviderOrigin::Compatibility,
            engine_version: Some("1.0.0".into()),
            quality_profile: crate::services::file::contracts::FileConversionQualityProfile::CompatibilityProvider,
            warning_keys: Vec::new(),
            page_count: None,
            quality_issues: Vec::new(),
}
    }

    fn retryable_failure() -> FileConversionError {
        queue_error(
            FileConversionErrorCode::ProviderFailed,
            "The provider failed.",
            true,
        )
    }
}
