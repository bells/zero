use crate::plugins::contracts::PluginManifest;

// Compile-time bytes only: external archives cannot enter this trusted catalog.
pub fn manifests() -> Vec<PluginManifest> {
    let metadata: &[&str] = &[
        #[cfg(feature = "bundled-tools")]
        include_str!("../../src/plugins/screenshot/metadata.json"),
        #[cfg(feature = "bundled-tools")]
        include_str!("../../src/plugins/caffeine/metadata.json"),
        #[cfg(feature = "bundled-tools")]
        include_str!("../../src/plugins/bingWallpaper/metadata.json"),
        #[cfg(feature = "bundled-tools")]
        include_str!("../../src/plugins/quickLauncher/metadata.json"),
        #[cfg(feature = "file-tool")]
        include_str!("../../src/plugins/file/metadata.json"),
    ];
    metadata
        .iter()
        .map(|json| serde_json::from_str(json).expect("validated bundled metadata"))
        .collect()
}
