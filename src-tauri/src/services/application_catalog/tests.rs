use super::*;
use std::cell::Cell;
use std::sync::atomic::{AtomicUsize, Ordering};

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        static NEXT_ID: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "zero-app-catalog-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn bundle(&self, name: &str, title: &str, id: Option<&str>) -> PathBuf {
        let bundle = self.0.join(name);
        let contents = bundle.join("Contents");
        fs::create_dir_all(contents.join("MacOS")).unwrap();
        fs::write(contents.join("MacOS/Runner"), b"synthetic").unwrap();
        let mut dictionary = plist::Dictionary::new();
        dictionary.insert("CFBundleDisplayName".into(), title.into());
        dictionary.insert("CFBundleName".into(), "fallback".into());
        dictionary.insert("CFBundleExecutable".into(), "Runner".into());
        if let Some(id) = id {
            dictionary.insert("CFBundleIdentifier".into(), id.into());
        }
        plist::Value::Dictionary(dictionary)
            .to_file_xml(contents.join("Info.plist"))
            .unwrap();
        bundle.canonicalize().unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixture_scan(roots: &[PathBuf], limits: Limits) -> Result<Catalog, DiscoveryError> {
    scan_roots(roots, limits, &|| false)
}

#[test]
fn maps_bundle_fields_and_bundle_boundaries() {
    let root = Fixture::new();
    let alpha = root.bundle("Nested/Outer.app", "Alpha", Some("example.alpha"));
    root.bundle("Nested/Outer.app/Contents/Hidden.app", "Hidden", None);
    let zebra = root.bundle("Zebra.app", "zebra", None);
    fs::write(root.0.join("regular.app"), b"not a bundle").unwrap();

    let catalog = fixture_scan(&[root.0.clone()], Limits::DEFAULT).unwrap();
    let [first, second] = catalog.candidates.as_slice() else {
        panic!("expected two application candidates");
    };
    assert_eq!(first.identity, "example.alpha");
    assert_eq!(first.title, "Alpha");
    assert_eq!(first.path, alpha);
    assert_eq!(first.bundle_id.as_deref(), Some("example.alpha"));
    assert_eq!(
        first.executable_path.as_deref(),
        Some(alpha.join("Contents/MacOS/Runner").as_path())
    );
    assert_eq!(first.icon_source, alpha);
    assert!(first.modified_at.is_some());
    assert_eq!(second.identity, zebra.to_string_lossy().to_lowercase());
    assert_eq!(catalog.skipped.len(), 1);
    assert!(catalog.skipped[0].contains("regular.app"));
}

#[test]
fn later_macos_root_retains_legacy_duplicate_priority() {
    let system = Fixture::new();
    let user = Fixture::new();
    system.bundle("System.app", "System", Some("example.same"));
    let preferred = user.bundle("User.app", "User", Some("example.same"));
    let catalog = fixture_scan(&[system.0.clone(), user.0.clone()], Limits::DEFAULT).unwrap();
    assert_eq!(catalog.candidates.len(), 1);
    assert_eq!(catalog.candidates[0].path, preferred);
}

#[test]
fn skips_directory_links_bundle_links_and_linked_manifest() {
    use std::os::unix::fs::symlink;

    let root = Fixture::new();
    let outside = Fixture::new();
    let external = outside.bundle("External.app", "External", None);
    symlink(&root.0, root.0.join("loop")).unwrap();
    symlink(&outside.0, root.0.join("external")).unwrap();
    symlink(&external, root.0.join("Linked.app")).unwrap();
    let internal = root.bundle("Internal.app", "Internal", None);
    fs::remove_file(internal.join("Contents/Info.plist")).unwrap();
    symlink(
        external.join("Contents/Info.plist"),
        internal.join("Contents/Info.plist"),
    )
    .unwrap();
    let catalog = fixture_scan(&[root.0.clone()], Limits::DEFAULT).unwrap();
    assert!(catalog.candidates.is_empty());
    assert_eq!(catalog.skipped.len(), 1);
    assert!(catalog.skipped[0].contains("Info.plist"));
}

#[test]
fn aborts_at_entry_depth_and_input_limits() {
    let root = Fixture::new();
    root.bundle("One.app", "One", None);
    root.bundle("Nested/Two.app", "Two", None);
    for (limits, expected) in [
        (
            Limits {
                entries: 2,
                ..Limits::DEFAULT
            },
            DiscoveryError::EntryLimit,
        ),
        (
            Limits {
                depth: 1,
                ..Limits::DEFAULT
            },
            DiscoveryError::DepthLimit,
        ),
        (
            Limits {
                input_bytes: 32,
                ..Limits::DEFAULT
            },
            DiscoveryError::InputLimit,
        ),
    ] {
        assert_eq!(
            fixture_scan(&[root.0.clone()], limits).unwrap_err(),
            expected
        );
    }
}

#[test]
fn cancellation_at_entry_and_candidate_boundaries_discards_catalog() {
    let root = Fixture::new();
    root.bundle("One.app", "One", None);
    root.bundle("Two.app", "Two", None);
    let total_checks = Cell::new(0);
    let run = || total_checks.set(total_checks.get() + 1);
    scan_roots(&[root.0.clone()], Limits::DEFAULT, &|| {
        run();
        false
    })
    .unwrap();
    for stop_at in 1..=total_checks.get() {
        let checks = Cell::new(0);
        let scan = scan_roots(&[root.0.clone()], Limits::DEFAULT, &|| {
            checks.set(checks.get() + 1);
            checks.get() == stop_at
        });
        assert_eq!(scan.unwrap_err(), DiscoveryError::Cancelled);
    }
}

#[test]
fn reads_binary_plists_and_preserves_name_fallback() {
    let root = Fixture::new();
    let named = root.bundle("Named.app", "Unused", None);
    let fallback = root.bundle("Basename.app", "Unused", None);

    let mut dictionary = plist::Dictionary::new();
    dictionary.insert("CFBundleName".into(), "Bundle name".into());
    plist::Value::Dictionary(dictionary)
        .to_file_binary(named.join("Contents/Info.plist"))
        .unwrap();
    plist::Value::Dictionary(plist::Dictionary::new())
        .to_file_xml(fallback.join("Contents/Info.plist"))
        .unwrap();

    let catalog = fixture_scan(&[root.0.clone()], Limits::DEFAULT).unwrap();
    assert!(catalog.skipped.is_empty());
    let [first, second] = catalog.candidates.as_slice() else {
        panic!("expected two application candidates");
    };
    assert_eq!(first.title, "Basename");
    assert_eq!(first.executable_path, None);
    assert_eq!(second.title, "Bundle name");
}

#[test]
fn skips_executables_outside_the_bundle() {
    use std::os::unix::fs::symlink;

    let root = Fixture::new();
    let outside = Fixture::new();
    let external = outside.bundle("External.app", "External", None);
    let bundle = root.bundle("Internal.app", "Internal", None);
    let runner = bundle.join("Contents/MacOS/Runner");
    fs::remove_file(&runner).unwrap();
    symlink(external.join("Contents/MacOS/Runner"), runner).unwrap();

    let catalog = fixture_scan(&[root.0.clone()], Limits::DEFAULT).unwrap();
    assert!(catalog.candidates.is_empty());
    assert_eq!(catalog.skipped.len(), 1);
    assert!(catalog.skipped[0].contains("has no valid executable"));
}

#[test]
fn aggregates_individually_valid_candidates_and_duplicate_work() {
    let root = Fixture::new();
    for name in ["First.app", "Second.app", "Third.app"] {
        root.bundle(name, &"t".repeat(2048), Some("example.same"));
    }
    let limits = Limits {
        payload_bytes: 5 * 1024,
        ..Limits::DEFAULT
    };
    assert_eq!(
        fixture_scan(&[root.0.clone()], limits).unwrap_err(),
        DiscoveryError::PayloadLimit
    );
    let catalog = fixture_scan(&[root.0.clone()], Limits::DEFAULT).unwrap();
    assert_eq!(catalog.candidates.len(), 1);
}

#[test]
fn skipped_entry_text_counts_against_payload_budget() {
    let root = Fixture::new();
    fs::write(root.0.join("invalid.app"), b"not a bundle").unwrap();
    assert_eq!(
        fixture_scan(
            &[root.0.clone()],
            Limits {
                payload_bytes: 10,
                ..Limits::DEFAULT
            },
        )
        .unwrap_err(),
        DiscoveryError::PayloadLimit
    );
}
