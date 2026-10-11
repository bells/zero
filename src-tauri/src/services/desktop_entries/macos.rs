use super::*;
use std::os::unix::fs::PermissionsExt;

pub(super) fn zero_bundle(executable: &Path) -> Option<PathBuf> {
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app")
        .then(|| bundle.to_path_buf())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn launcher_script(bundle: &Path, tool: &str) -> Result<String, String> {
    let bundle = bundle.to_str().ok_or("application path is not UTF-8")?;
    Ok(format!(
        "#!/bin/sh\nexec /usr/bin/open -n -a {} --args --zero-tool {}\n",
        shell_quote(bundle),
        shell_quote(tool)
    ))
}

pub(super) fn install(applications: &Path, bundle: &Path) -> Result<(), String> {
    real_directory(applications)?;
    let root = applications.join("Zero Tools");
    owned_directory(&root)?;
    for (tool, title) in TOOLS.iter().copied() {
        let entry = root.join(format!("{title}.app"));
        owned_directory(&entry)?;
        let contents = entry.join("Contents");
        let macos = contents.join("MacOS");
        let resources = contents.join("Resources");
        real_directory(&macos)?;
        real_directory(&resources)?;
        let executable = macos.join("ZeroTool");
        write_changed(&executable, launcher_script(bundle, tool)?.as_bytes())?;
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
        write_changed(
            &resources.join("Zero.icns"),
            include_bytes!("../../../icons/icon.icns"),
        )?;
        let mut info = plist::Dictionary::new();
        for (key, value) in [
            ("CFBundleName", title.to_owned()),
            ("CFBundleDisplayName", title.to_owned()),
            (
                "CFBundleIdentifier",
                format!("com.watson.ztool.entry.{tool}"),
            ),
            ("CFBundleExecutable", "ZeroTool".into()),
            ("CFBundlePackageType", "APPL".into()),
            ("CFBundleVersion", "1".into()),
            ("CFBundleShortVersionString", "1.0".into()),
            ("CFBundleIconFile", "Zero.icns".into()),
        ] {
            info.insert(key.into(), plist::Value::String(value));
        }
        info.insert("LSUIElement".into(), plist::Value::Boolean(true));
        let mut bytes = Vec::new();
        plist::Value::Dictionary(info)
            .to_writer_xml(&mut bytes)
            .map_err(|e| e.to_string())?;
        write_changed(&contents.join("Info.plist"), &bytes)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundle_detection_and_shell_quoting_handle_spaces_and_metacharacters() {
        assert_eq!(
            zero_bundle(Path::new("/Applications/Zero.app/Contents/MacOS/zero")),
            Some(PathBuf::from("/Applications/Zero.app"))
        );
        assert!(zero_bundle(Path::new("/tmp/target/debug/zero")).is_none());
        let script = launcher_script(
            Path::new("/Applications/Watson's $(touch nope) Zero.app"),
            "snap",
        )
        .unwrap();
        assert!(script.contains("Watson'\\''s $(touch nope) Zero.app'"));
        assert!(script.ends_with("--zero-tool 'snap'\n"));
    }

    #[test]
    fn entry_installation_is_idempotent_and_updates_host_path() {
        let root = test_root();
        install(&root, Path::new("/Applications/Zero.app")).unwrap();
        let entry = root.join("Zero Tools/Zero Snap.app/Contents/MacOS/ZeroTool");
        let modified = std::fs::metadata(&entry).unwrap().modified().unwrap();
        install(&root, Path::new("/Applications/Zero.app")).unwrap();
        assert_eq!(
            modified,
            std::fs::metadata(&entry).unwrap().modified().unwrap()
        );
        install(&root, Path::new("/Applications/New Zero.app")).unwrap();
        assert!(std::fs::read_to_string(&entry)
            .unwrap()
            .contains("New Zero.app"));
        for (_, title) in TOOLS.iter().copied() {
            let plist = plist::Value::from_file(
                root.join(format!("Zero Tools/{title}.app/Contents/Info.plist")),
            )
            .unwrap();
            assert_eq!(
                plist.as_dictionary().unwrap()["CFBundleName"].as_string(),
                Some(title)
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
