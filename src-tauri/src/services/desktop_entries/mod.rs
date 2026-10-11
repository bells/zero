use std::path::Path;
#[cfg(any(test, target_os = "macos"))]
use std::path::PathBuf;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub(super) const TOOLS: [(&str, &str); 5] = [
    ("snap", "Zero Snap"),
    ("awake", "Zero Awake"),
    ("paper", "Zero Paper"),
    ("launch", "Zero Launch"),
    ("file", "Zero File"),
];
const OWNER: &str = "com.watson.ztool.desktop-entries.v1";

fn activation(args: &[String]) -> Result<Option<&str>, ()> {
    match args.get(1..).unwrap_or_default() {
        [] => Ok(None),
        [flag, tool] if flag == "--zero-tool" && TOOLS.iter().any(|(id, _)| id == tool) => {
            Ok(Some(tool))
        }
        _ => Err(()),
    }
}

pub fn dispatch(app: &tauri::AppHandle, args: &[String], secondary: bool) {
    let result = match activation(args) {
        Ok(Some(tool)) => {
            let plugin_id = format!("zero.{tool}");
            if crate::plugin_is_enabled(app, &plugin_id) {
                crate::commands::app::open_main_tool(app, &plugin_id)
            } else {
                crate::commands::app::open_main_window(app.clone())
            }
        }
        Ok(None) if secondary => crate::commands::app::open_main_window(app.clone()),
        _ => return,
    };
    crate::services::diagnostics::native(
        None,
        "window",
        if result.is_ok() {
            crate::services::diagnostics::contracts::Outcome::Succeeded
        } else {
            crate::services::diagnostics::contracts::Outcome::Failed
        },
    );
}

pub fn start_sync(app: &tauri::AppHandle) {
    let owner = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = sync(&owner);
        crate::services::diagnostics::native(
            None,
            "desktop-entries",
            if result.is_ok() {
                crate::services::diagnostics::contracts::Outcome::Succeeded
            } else {
                crate::services::diagnostics::contracts::Outcome::Failed
            },
        );
    });
}

fn sync(_app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        // Raw cargo/tauri dev executables are temporary and must not leave broken applications.
        if let Some(bundle) = macos::zero_bundle(&executable) {
            #[cfg(debug_assertions)]
            let applications = match std::env::var_os("ZERO_DESKTOP_ENTRIES_TEST_ROOT") {
                Some(root) => PathBuf::from(root),
                None => return Ok(()),
            };
            #[cfg(not(debug_assertions))]
            let applications = crate::brand::default_home().join("Applications");
            macos::install(&applications, &bundle)?;
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Source builds must not publish pointers into a disposable target directory.
        if !cfg!(debug_assertions) {
            windows::install()?;
        }
    }
    Ok(())
}

fn real_directory(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        real_directory(parent)?;
    }
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(()),
        Ok(_) => Err("desktop entry directory is not a real directory".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(path).map_err(|e| e.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn owned_directory(path: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {
            let marker = path.join(".zero-owner");
            regular_file_or_missing(&marker)?;
            if std::fs::read_to_string(marker).ok().as_deref() != Some(OWNER) {
                return Err("desktop entry directory belongs to another owner".into());
            }
            Ok(())
        }
        Ok(_) => Err("desktop entry directory is not a real directory".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            real_directory(path)?;
            write_changed(&path.join(".zero-owner"), OWNER.as_bytes())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn regular_file_or_missing(path: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => Ok(()),
        Ok(_) => Err("desktop entry file is not a regular file".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_changed(path: &Path, bytes: &[u8]) -> Result<(), String> {
    regular_file_or_missing(path)?;
    if std::fs::read(path).ok().as_deref() != Some(bytes) {
        std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
fn test_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "zero-entry-{}-{}",
        std::process::id(),
        crate::services::diagnostics::nonce().unwrap()
    ));
    std::fs::create_dir(&root).unwrap();
    root.canonicalize().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_bundled_tool_arguments_are_accepted() {
        for (id, _) in TOOLS {
            let args = vec!["Zero".into(), "--zero-tool".into(), id.into()];
            assert_eq!(activation(&args), Ok(Some(id)));
        }
        assert_eq!(activation(&["Zero".into()]), Ok(None));
        for args in [
            vec!["Zero", "--zero-tool", "../snap"],
            vec!["Zero", "--zero-tool"],
            vec!["Zero", "--zero-tool", "snap", "extra"],
            vec!["Zero", "--exec", "snap"],
        ] {
            assert!(activation(&args.into_iter().map(String::from).collect::<Vec<_>>()).is_err());
        }
    }

    #[test]
    fn owned_directories_are_repeatable_and_preserve_unrelated_content() {
        let root = test_root();
        let owned = root.join("owned");
        owned_directory(&owned).unwrap();
        owned_directory(&owned).unwrap();
        let unrelated = root.join("unrelated");
        std::fs::create_dir(&unrelated).unwrap();
        std::fs::write(unrelated.join("keep"), "private").unwrap();
        assert!(owned_directory(&unrelated).is_err());
        assert_eq!(
            std::fs::read_to_string(unrelated.join("keep")).unwrap(),
            "private"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn links_to_directories_and_files_are_preserved() {
        let root = test_root();
        let outside = root.join("outside");
        std::fs::create_dir(&outside).unwrap();
        let linked = root.join("linked");
        std::os::unix::fs::symlink(&outside, &linked).unwrap();
        assert!(owned_directory(&linked).is_err());
        assert!(real_directory(&linked.join("child")).is_err());
        let file = outside.join("keep");
        std::fs::write(&file, "private").unwrap();
        let linked_file = root.join("file");
        std::os::unix::fs::symlink(&file, &linked_file).unwrap();
        assert!(write_changed(&linked_file, b"changed").is_err());
        assert_eq!(std::fs::read_to_string(file).unwrap(), "private");
        std::fs::remove_dir_all(root).unwrap();
    }
}
