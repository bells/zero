use crate::plugins::contracts::PluginManifest;

// Compile-time bytes only: external archives cannot enter this trusted catalog.
pub fn manifests() -> Vec<PluginManifest> {
    [
        include_str!("../../src/plugins/screenshot/metadata.json"),
        include_str!("../../src/plugins/caffeine/metadata.json"),
        include_str!("../../src/plugins/bingWallpaper/metadata.json"),
        include_str!("../../src/plugins/quickLauncher/metadata.json"),
        include_str!("../../src/plugins/file/metadata.json"),
    ]
    .into_iter()
    .map(|json| serde_json::from_str(json).expect("validated bundled metadata"))
    .collect()
}
