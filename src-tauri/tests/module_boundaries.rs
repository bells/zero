use std::fs;
use std::path::{Path, PathBuf};

fn manifest_path(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(relative)
}

fn assert_no_peer_tool_dependency(source: &str) {
    for dependency in [
        "caffeine",
        "quick_launcher",
        "screenshot",
        "commands::file",
        "services::file",
    ] {
        assert!(
            !source.contains(dependency),
            "wallpaper code must stay independent of {dependency}"
        );
    }
}

#[test]
fn paper_window_is_owned_by_the_bundled_command_module() {
    let commands = fs::read_to_string(manifest_path("src/commands/bing_wallpaper/mod.rs")).unwrap();
    assert!(commands.contains("mod window;"));
    assert!(manifest_path("src/commands/bing_wallpaper/window.rs").is_file());
    assert!(!manifest_path("src/commands/paper.rs").exists());
    for path in ["src/commands/mod.rs", "src/services/mod.rs"] {
        let modules = fs::read_to_string(manifest_path(path)).unwrap();
        let lines: Vec<_> = modules.lines().map(str::trim).collect();
        assert!(
            lines.windows(2).any(|pair| pair
                == [
                    "#[cfg(feature = \"bundled-tools\")]",
                    "pub mod bing_wallpaper;"
                ]),
            "the Bing Wallpaper module in {path} must be feature-gated"
        );
    }
}

#[test]
fn generic_wallpaper_adapter_is_available_to_core_without_bing_policy() {
    use zero_lib::services::wallpaper::{SystemWallpaperSetter, WallpaperSetter};

    let _: &dyn WallpaperSetter = &SystemWallpaperSetter;
    let wallpaper = fs::read_to_string(manifest_path("src/services/wallpaper.rs")).unwrap();
    assert_no_peer_tool_dependency(&wallpaper);
    for policy in [
        "bing_wallpaper",
        "BingWallpaper",
        "bing.com",
        "HPImageArchive",
        "zero.paper",
        "paper.daily",
    ] {
        assert!(
            !wallpaper.contains(policy),
            "bundled Paper policy {policy} belongs outside the generic wallpaper service"
        );
    }
    let media = fs::read_to_string(manifest_path("src/plugins/media_runtime.rs")).unwrap();
    assert!(media.contains("services::wallpaper::"));
    assert!(!media.contains("bing_wallpaper"));
    assert_no_peer_tool_dependency(&media);
}

#[cfg(feature = "bundled-tools")]
#[test]
fn bundled_wallpaper_facade_uses_the_generic_adapter() {
    use zero_lib::{
        plugins::contracts::NativeResourceError,
        services::{bing_wallpaper::wallpaper as bundled, wallpaper as host},
    };

    type ApplyWallpaper =
        fn(&dyn host::WallpaperSetter, &Path, &str) -> Result<PathBuf, NativeResourceError>;
    let _: ApplyWallpaper = bundled::set_plugin_wallpaper;
    let _: fn(&Path, &str) -> Result<PathBuf, NativeResourceError> = bundled::validate_plugin_image;
    let _: fn() -> host::WallpaperPlatformCapability = bundled::platform_capability;
    let _: &dyn host::WallpaperSetter = &bundled::SystemWallpaperSetter;

    let facade =
        fs::read_to_string(manifest_path("src/services/bing_wallpaper/wallpaper.rs")).unwrap();
    assert!(facade.contains("crate::services::wallpaper"));
    assert_no_peer_tool_dependency(&facade);
}

#[test]
fn concrete_window_commands_depend_on_the_host_coordinator_not_peer_plugins() {
    let launcher = fs::read_to_string(manifest_path("src/commands/quick_launcher.rs")).unwrap();
    let paper = fs::read_to_string(manifest_path("src/commands/bing_wallpaper/window.rs")).unwrap();

    assert!(launcher.contains("services::tool_windows"));
    assert!(paper.contains("services::tool_windows"));
    assert!(!launcher.contains("commands::bing_wallpaper"));
    assert_no_peer_tool_dependency(&paper);
}

#[test]
fn rust_composition_registers_each_bundled_plugin_state_and_handler_group() {
    let composition = fs::read_to_string(manifest_path("src/bundled_plugins.rs")).unwrap();
    for state in [
        "CaffeineState",
        "BingWallpaperState",
        "FileConversionState",
        "QuickLauncherState",
        "ScreenshotSessionStore",
    ] {
        assert!(composition.contains(state), "missing bundled state {state}");
    }

    let lib = fs::read_to_string(manifest_path("src/lib.rs")).unwrap();
    for handler in [
        "commands::caffeine::get_caffeine_state",
        "commands::file::get_file_conversion_capabilities",
        "commands::bing_wallpaper::get_bing_wallpaper_snapshot",
        "commands::quick_launcher::get_quick_launcher_snapshot",
        "commands::screenshot::get_screenshot_capabilities",
    ] {
        assert!(lib.contains(handler), "missing bundled handler {handler}");
    }
}
