use std::sync::Arc;

use super::built_in::ZeroFileBuiltInProvider;
use super::contracts::{
    FileConversionCapabilitySnapshot, FileConversionDirection, FileConversionDirectionCapability,
    FileConversionError, FileConversionErrorCode, FileConversionProvider,
    FileConversionProviderAvailability, FileConversionProviderId,
};
use super::discovery::LibreOfficeDiscovery;
use super::engine_bridge::FileEngineBridge;
use super::libreoffice::LibreOfficeProvider;
use super::provider::{
    provider_error, FileConversionProvider as FileConversionProviderAdapter,
    FileConversionProviderRegistry, ProviderPlatform,
};
#[cfg(target_os = "macos")]
use super::word_macos::MicrosoftWordMacosProvider;
#[cfg(target_os = "windows")]
use super::word_windows::MicrosoftWordWindowsProvider;

pub const PDF_TO_DOCX_PROVIDER_APPROVED: bool = true;
pub const BUNDLED_FILE_CONVERSION_ENGINE_APPROVED: bool = true;

// Keep state-only tests independent of AppHandle so their Windows EXE avoids GUI imports.
pub fn default_provider_registry() -> FileConversionProviderRegistry {
    platform_provider_registry(Vec::new())
}

pub fn provider_registry_with_engine(
    app: tauri::AppHandle,
    bridge: Arc<FileEngineBridge>,
) -> FileConversionProviderRegistry {
    let mut built_in: Vec<Arc<dyn FileConversionProviderAdapter>> = Vec::new();
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        built_in.push(Arc::new(ZeroFileBuiltInProvider::pdf_to_docx(
            app.clone(),
            Arc::clone(&bridge),
        )));
        #[cfg(target_os = "macos")]
        built_in.push(Arc::new(ZeroFileBuiltInProvider::docx_to_pdf_macos(
            app, bridge,
        )));
        #[cfg(target_os = "windows")]
        built_in.push(Arc::new(ZeroFileBuiltInProvider::docx_to_pdf_windows(
            app, bridge,
        )));
    }
    platform_provider_registry(built_in)
}

fn platform_provider_registry(
    mut providers: Vec<Arc<dyn FileConversionProviderAdapter>>,
) -> FileConversionProviderRegistry {
    let libreoffice_discovery = Arc::new(LibreOfficeDiscovery::default());
    providers.push(Arc::new(LibreOfficeProvider::new(libreoffice_discovery)));
    #[cfg(target_os = "macos")]
    providers.push(Arc::new(MicrosoftWordMacosProvider::default()));
    #[cfg(target_os = "windows")]
    providers.push(Arc::new(MicrosoftWordWindowsProvider::default()));
    FileConversionProviderRegistry::new(providers)
}

pub fn capability_snapshot(
    registry: &FileConversionProviderRegistry,
    platform: ProviderPlatform,
    refreshed_at_ms: u64,
) -> FileConversionCapabilitySnapshot {
    let providers = registry.snapshots();
    capability_snapshot_from_providers(providers, platform, refreshed_at_ms)
}

pub fn capability_snapshot_from_providers(
    providers: Vec<FileConversionProvider>,
    platform: ProviderPlatform,
    refreshed_at_ms: u64,
) -> FileConversionCapabilitySnapshot {
    FileConversionCapabilitySnapshot {
        preference_revision: 0,
        capability_revision: 0,
        invalid_preference_directions: Vec::new(),
        directions: [
            FileConversionDirection::PdfToDocx,
            FileConversionDirection::DocxToPdf,
        ]
        .into_iter()
        .map(|direction| direction_capability(direction, &providers, platform))
        .collect(),
        refreshed_at_ms,
    }
}

fn direction_capability(
    direction: FileConversionDirection,
    providers: &[FileConversionProvider],
    platform: ProviderPlatform,
) -> FileConversionDirectionCapability {
    let provider_ids = super::preferences::supported_providers(direction, platform);
    let relevant = provider_ids.iter().map(|id| {
        providers.iter().find(|provider| provider.id == *id && provider.directions.contains(&direction)).cloned().unwrap_or_else(|| FileConversionProvider {
            id: *id,
            display_name: match id {
                FileConversionProviderId::ZeroFilePdfToDocx => "Zero File PDF Engine",
                FileConversionProviderId::ZeroFileDocxToPdfMacos => "Zero File macOS Print Engine",
                FileConversionProviderId::ZeroFileDocxToPdfWindows => "Zero File Windows Print Engine",
                FileConversionProviderId::LibreOffice => "LibreOffice",
                FileConversionProviderId::MicrosoftWordMacos | FileConversionProviderId::MicrosoftWordWindows => "Microsoft Word",
            }.into(),
            version: None, engine_version: None, package_version: None, platform_minimum: None,
            origin: if matches!(id, FileConversionProviderId::LibreOffice | FileConversionProviderId::MicrosoftWordMacos | FileConversionProviderId::MicrosoftWordWindows) { super::contracts::FileConversionProviderOrigin::Compatibility } else { super::contracts::FileConversionProviderOrigin::BuiltIn },
            quality_profiles: Vec::new(), directions: vec![direction],
            availability: FileConversionProviderAvailability::Unavailable { error: provider_error(FileConversionErrorCode::EngineUnavailable, "The selected local provider is unavailable on this platform or needs repair.", true, Some(*id)) },
        })
    }).collect::<Vec<_>>();
    let selected_provider_id = super::preferences::default_provider(direction, platform);
    let mut capability = FileConversionDirectionCapability {
        direction,
        available: false,
        selected_provider_id,
        preferred_provider_id: selected_provider_id,
        providers: relevant,
        unavailability: None,
    };
    apply_selection(&mut capability, selected_provider_id);
    capability
}

pub fn apply_preferences(
    snapshot: &mut FileConversionCapabilitySnapshot,
    preferences: &super::preferences::FileProviderPreferences,
) {
    snapshot.preference_revision = preferences.revision;
    snapshot.invalid_preference_directions = preferences.invalid_directions.clone();
    for capability in &mut snapshot.directions {
        apply_selection(capability, preferences.selected(capability.direction));
    }
}

fn apply_selection(
    capability: &mut FileConversionDirectionCapability,
    selected: Option<FileConversionProviderId>,
) {
    capability.preferred_provider_id = selected;
    let provider = capability
        .providers
        .iter()
        .find(|provider| Some(provider.id) == selected);
    capability.available = provider.is_some_and(|provider| {
        matches!(
            provider.availability,
            FileConversionProviderAvailability::Available
        )
    });
    capability.selected_provider_id = selected.filter(|_| capability.available);
    capability.unavailability = if capability.available {
        None
    } else {
        Some(match provider.map(|provider| &provider.availability) {
            Some(FileConversionProviderAvailability::Unavailable { error }) => error.clone(),
            _ => best_unavailability(&[], capability.direction),
        })
    };
}

fn best_unavailability(
    providers: &[FileConversionProvider],
    direction: FileConversionDirection,
) -> FileConversionError {
    providers
        .iter()
        .find_map(|provider| match &provider.availability {
            FileConversionProviderAvailability::Unavailable { error }
                if error.code != FileConversionErrorCode::EngineUnavailable =>
            {
                Some(error.clone())
            }
            _ => None,
        })
        .or_else(|| {
            providers.iter().find_map(|provider| match &provider.availability {
                FileConversionProviderAvailability::Unavailable { error } => Some(error.clone()),
                FileConversionProviderAvailability::Available => None,
            })
        })
        .unwrap_or_else(|| {
            provider_error(
                FileConversionErrorCode::EngineUnavailable,
                match direction {
                    FileConversionDirection::PdfToDocx => {
                        "No approved local PDF-to-DOCX provider is available."
                    }
                    FileConversionDirection::DocxToPdf => {
                        "The built-in DOCX-to-PDF engine is unavailable on this platform or needs repair."
                    }
                },
                true,
                None,
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::file::contracts::{
        FileConversionProviderOrigin, FileConversionQualityProfile,
    };

    #[test]
    fn pdf_to_docx_is_unavailable_only_when_the_built_in_provider_snapshot_is_absent() {
        let snapshot = capability_snapshot_from_providers(Vec::new(), ProviderPlatform::Macos, 10);
        let pdf = snapshot
            .directions
            .iter()
            .find(|capability| capability.direction == FileConversionDirection::PdfToDocx)
            .unwrap();

        const {
            assert!(PDF_TO_DOCX_PROVIDER_APPROVED);
            assert!(BUNDLED_FILE_CONVERSION_ENGINE_APPROVED);
        }
        assert!(!pdf.available);
        assert_eq!(pdf.providers.len(), 1);
        assert_eq!(
            pdf.preferred_provider_id,
            Some(FileConversionProviderId::ZeroFilePdfToDocx)
        );
        assert_eq!(
            pdf.unavailability.as_ref().unwrap().code,
            FileConversionErrorCode::EngineUnavailable
        );
    }

    #[test]
    fn docx_to_pdf_defaults_to_builtin_even_when_word_is_available() {
        let unavailable_libreoffice = provider(
            FileConversionProviderId::LibreOffice,
            FileConversionProviderAvailability::Unavailable {
                error: provider_error(
                    FileConversionErrorCode::EngineUnavailable,
                    "LibreOffice missing.",
                    true,
                    Some(FileConversionProviderId::LibreOffice),
                ),
            },
        );
        let available_word = provider(
            FileConversionProviderId::MicrosoftWordMacos,
            FileConversionProviderAvailability::Available,
        );
        let snapshot = capability_snapshot_from_providers(
            vec![available_word, unavailable_libreoffice],
            ProviderPlatform::Macos,
            20,
        );
        let docx = snapshot
            .directions
            .iter()
            .find(|capability| capability.direction == FileConversionDirection::DocxToPdf)
            .unwrap();

        assert!(!docx.available);
        assert_eq!(
            docx.preferred_provider_id,
            Some(FileConversionProviderId::ZeroFileDocxToPdfMacos)
        );
        assert_eq!(docx.providers[1].id, FileConversionProviderId::LibreOffice);
        assert_eq!(
            docx.providers[2].id,
            FileConversionProviderId::MicrosoftWordMacos
        );
        assert!(docx.unavailability.is_some());
    }

    #[test]
    fn unavailable_selected_provider_does_not_borrow_errors_from_other_providers() {
        let providers = vec![
            provider(
                FileConversionProviderId::LibreOffice,
                FileConversionProviderAvailability::Unavailable {
                    error: provider_error(
                        FileConversionErrorCode::EngineVersionUnsupported,
                        "Unsupported version.",
                        false,
                        Some(FileConversionProviderId::LibreOffice),
                    ),
                },
            ),
            provider(
                FileConversionProviderId::MicrosoftWordMacos,
                FileConversionProviderAvailability::Unavailable {
                    error: provider_error(
                        FileConversionErrorCode::EngineUnavailable,
                        "Word missing.",
                        true,
                        Some(FileConversionProviderId::MicrosoftWordMacos),
                    ),
                },
            ),
        ];

        let snapshot = capability_snapshot_from_providers(providers, ProviderPlatform::Macos, 30);
        let docx = snapshot
            .directions
            .iter()
            .find(|capability| capability.direction == FileConversionDirection::DocxToPdf)
            .unwrap();
        assert_eq!(
            docx.unavailability.as_ref().unwrap().code,
            FileConversionErrorCode::EngineUnavailable
        );
    }

    #[test]
    fn windows_selects_built_in_pdf_conversion_but_never_macos_docx_export() {
        let built_in_pdf = FileConversionProvider {
            id: FileConversionProviderId::ZeroFilePdfToDocx,
            display_name: "Zero File PDF Engine".into(),
            version: Some("1.1.0".into()),
            origin: FileConversionProviderOrigin::BuiltIn,
            engine_version: Some("1.1.0".into()),
            package_version: Some("1.1.0".into()),
            platform_minimum: None,
            quality_profiles: vec![FileConversionQualityProfile::EditableReconstruction],
            directions: vec![FileConversionDirection::PdfToDocx],
            availability: FileConversionProviderAvailability::Available,
        };
        let injected_macos_print = FileConversionProvider {
            id: FileConversionProviderId::ZeroFileDocxToPdfMacos,
            display_name: "Zero File macOS Print Engine".into(),
            version: Some("1.1.0".into()),
            origin: FileConversionProviderOrigin::BuiltIn,
            engine_version: Some("1.1.0".into()),
            package_version: Some("1.1.0".into()),
            platform_minimum: Some("macOS 11".into()),
            quality_profiles: vec![FileConversionQualityProfile::WebRenderedPdf],
            directions: vec![FileConversionDirection::DocxToPdf],
            availability: FileConversionProviderAvailability::Available,
        };
        let snapshot = capability_snapshot_from_providers(
            vec![built_in_pdf, injected_macos_print],
            ProviderPlatform::Windows,
            40,
        );
        let pdf = snapshot
            .directions
            .iter()
            .find(|capability| capability.direction == FileConversionDirection::PdfToDocx)
            .unwrap();
        let docx = snapshot
            .directions
            .iter()
            .find(|capability| capability.direction == FileConversionDirection::DocxToPdf)
            .unwrap();

        assert_eq!(
            pdf.selected_provider_id,
            Some(FileConversionProviderId::ZeroFilePdfToDocx)
        );
        assert!(docx
            .providers
            .iter()
            .all(|provider| provider.id != FileConversionProviderId::ZeroFileDocxToPdfMacos));
        assert!(!docx.available);
    }

    fn provider(
        id: FileConversionProviderId,
        availability: FileConversionProviderAvailability,
    ) -> FileConversionProvider {
        FileConversionProvider {
            id,
            display_name: format!("{id:?}"),
            version: None,
            origin: FileConversionProviderOrigin::Compatibility,
            engine_version: None,
            package_version: None,
            platform_minimum: None,
            quality_profiles: vec![FileConversionQualityProfile::CompatibilityProvider],
            directions: vec![FileConversionDirection::DocxToPdf],
            availability,
        }
    }
}
