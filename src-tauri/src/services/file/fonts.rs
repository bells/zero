use super::contracts::FileFontInspection;
use quick_xml::{events::Event, Reader};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Seek};
use std::path::Path;

const MAX_FAMILIES: usize = 100;
const MAX_XML_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 128 * 1024 * 1024;

pub fn normalize_family(value: &str) -> Option<String> {
    let value = value.trim();
    let value = if value.len() > 7
        && value.as_bytes()[..6].iter().all(u8::is_ascii_uppercase)
        && value.as_bytes()[6] == b'+'
    {
        &value[7..]
    } else {
        value
    };
    super::quality::safe_font_family(value).then(|| value.to_string())
}

pub fn inspect_families(families: Vec<String>) -> FileFontInspection {
    let mut result = FileFontInspection::default();
    let mut unique = BTreeSet::new();
    for raw in families {
        match normalize_family(&raw) {
            Some(family) if is_generic_family(&family) => result.incomplete = true,
            Some(family) if unique.contains(&family) => (),
            Some(family) if unique.len() < MAX_FAMILIES => {
                unique.insert(family);
            }
            _ => result.incomplete = true,
        }
    }
    if unique.is_empty() {
        result.incomplete = true;
    }
    for family in unique {
        match system_family_available(&family) {
            Some(true) => result.available_families.push(family),
            Some(false) => result.missing_families.push(family),
            None => result.incomplete = true,
        }
    }
    result
}

fn is_generic_family(family: &str) -> bool {
    matches!(
        family.to_ascii_lowercase().as_str(),
        "serif"
            | "sans-serif"
            | "monospace"
            | "cursive"
            | "fantasy"
            | "system-ui"
            | "ui-serif"
            | "ui-sans-serif"
            | "ui-monospace"
            | "ui-rounded"
            | "math"
            | "emoji"
            | "fangsong"
    )
}

pub fn inspect_docx(path: &Path) -> Result<FileFontInspection, String> {
    let file = std::fs::File::open(path).map_err(|_| "invalidInput")?;
    let (families, incomplete, embedded_families) = docx_families(file)?;
    let mut result = inspect_families(families);
    result.incomplete |= incomplete;
    result.embedded_families = embedded_families;
    Ok(result)
}

fn docx_families<R: Read + Seek>(reader: R) -> Result<(Vec<String>, bool, Vec<String>), String> {
    let mut archive = zip::ZipArchive::new(reader).map_err(|_| "invalidInput")?;
    if archive.len() > 4096 {
        return Err("unsupportedInput".into());
    }
    let mut expanded = 0_u64;
    for i in 0..archive.len() {
        expanded = expanded
            .checked_add(archive.by_index(i).map_err(|_| "invalidInput")?.size())
            .ok_or("unsupportedInput")?;
    }
    if expanded > MAX_PACKAGE_BYTES {
        return Err("unsupportedInput".into());
    }
    let mut families = BTreeSet::new();
    let mut themes = BTreeMap::<String, String>::new();
    let mut references = BTreeSet::new();
    let mut incomplete = false;
    let mut embedded = BTreeSet::new();
    for i in 0..archive.len() {
        let mut part = archive.by_index(i).map_err(|_| "invalidInput")?;
        if !part.name().starts_with("word/")
            || !(part.name().ends_with(".xml") || part.name().ends_with(".rels"))
        {
            continue;
        }
        if part.size() > MAX_XML_BYTES {
            return Err("unsupportedInput".into());
        }
        let mut bytes = Vec::new();
        part.by_ref()
            .take(MAX_XML_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "invalidInput")?;
        let mut font_name = None;
        let mut reader = Reader::from_reader(bytes.as_slice());
        let mut theme_group = String::new();
        loop {
            match reader.read_event().map_err(|_| "invalidInput")? {
                Event::Start(ref element) | Event::Empty(ref element) => {
                    let local = element.local_name();
                    let name = local.as_ref();
                    if [
                        b"altChunk".as_slice(),
                        b"subDoc",
                        b"object",
                        b"oleObject",
                        b"chart",
                    ]
                    .contains(&name)
                    {
                        return Err("unsupportedInput".into());
                    }
                    let mut attrs = BTreeMap::new();
                    for attr in element.attributes() {
                        let attr = attr.map_err(|_| "invalidInput")?;
                        attrs.insert(
                            String::from_utf8_lossy(attr.key.local_name().as_ref()).into_owned(),
                            attr.decode_and_unescape_value(reader.decoder())
                                .map_err(|_| "invalidInput")?
                                .into_owned(),
                        );
                    }
                    if name == b"Relationship"
                        && attrs
                            .get("TargetMode")
                            .is_some_and(|mode| mode == "External")
                        && !attrs
                            .get("Type")
                            .is_some_and(|kind| kind.ends_with("/hyperlink"))
                    {
                        return Err("unsupportedInput".into());
                    }
                    if name == b"majorFont" {
                        theme_group = "major".into();
                    }
                    if name == b"minorFont" {
                        theme_group = "minor".into();
                    }
                    if [b"latin".as_slice(), b"ea", b"cs"].contains(&name)
                        && !theme_group.is_empty()
                    {
                        if let Some(family) =
                            attrs.get("typeface").and_then(|v| normalize_family(v))
                        {
                            let suffix = if name == b"latin" {
                                "HAnsi"
                            } else if name == b"ea" {
                                "EastAsia"
                            } else {
                                "Bidi"
                            };
                            themes.insert(format!("{theme_group}{suffix}"), family.clone());
                            if name == b"latin" {
                                themes.insert(format!("{theme_group}Ascii"), family);
                            }
                        }
                    }
                    if name == b"font" {
                        font_name = attrs.get("name").and_then(|value| normalize_family(value));
                    }
                    if name == b"rFonts" {
                        for (key, theme_key) in [
                            ("ascii", "asciiTheme"),
                            ("hAnsi", "hAnsiTheme"),
                            ("eastAsia", "eastAsiaTheme"),
                            ("cs", "cstheme"),
                        ] {
                            // OOXML theme attributes override the explicit family in the same channel.
                            if attrs.contains_key(theme_key)
                                || (key == "cs" && attrs.contains_key("csTheme"))
                            {
                                continue;
                            }
                            if let Some(raw) = attrs.get(key) {
                                if let Some(family) = normalize_family(raw) {
                                    families.insert(family);
                                } else {
                                    incomplete = true;
                                }
                            }
                        }
                        for key in [
                            "asciiTheme",
                            "hAnsiTheme",
                            "eastAsiaTheme",
                            "cstheme",
                            "csTheme",
                        ] {
                            if let Some(value) = attrs.get(key) {
                                references.insert(value.clone());
                            }
                        }
                    }
                    if [
                        b"embedRegular".as_slice(),
                        b"embedBold",
                        b"embedItalic",
                        b"embedBoldItalic",
                    ]
                    .contains(&name)
                    {
                        if let Some(family) = &font_name {
                            embedded.insert(family.clone());
                        } else {
                            incomplete = true;
                        }
                    }
                }
                Event::End(element)
                    if [b"majorFont".as_slice(), b"minorFont"]
                        .contains(&element.local_name().as_ref()) =>
                {
                    theme_group.clear()
                }
                Event::End(element) if element.local_name().as_ref() == b"font" => {
                    font_name = None;
                }
                Event::DocType(_) => return Err("unsupportedInput".into()),
                Event::Eof => break,
                _ => (),
            }
        }
    }
    for reference in references {
        if let Some(family) = themes.get(&reference) {
            families.insert(family.clone());
        } else {
            incomplete = true;
        }
    }
    if families.len() > MAX_FAMILIES {
        incomplete = true;
    }
    Ok((
        families.into_iter().take(MAX_FAMILIES).collect(),
        incomplete,
        embedded.into_iter().take(MAX_FAMILIES).collect(),
    ))
}

#[cfg(target_os = "macos")]
fn system_family_available(family: &str) -> Option<bool> {
    use std::ffi::{c_char, c_void, CString};
    #[link(name = "CoreText", kind = "framework")]
    extern "C" {
        fn CTFontCreateWithName(
            name: *const c_void,
            size: f64,
            matrix: *const c_void,
        ) -> *const c_void;
        fn CTFontCopyFamilyName(font: *const c_void) -> *const c_void;
        fn CTFontCopyPostScriptName(font: *const c_void) -> *const c_void;
        fn CTFontCopyFullName(font: *const c_void) -> *const c_void;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFStringGetCString(
            value: *const c_void,
            buffer: *mut c_char,
            size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(value: *const c_void);
    }
    const UTF8: u32 = 0x08000100;
    let input = CString::new(family).ok()?;
    unsafe {
        let name = CFStringCreateWithCString(std::ptr::null(), input.as_ptr(), UTF8);
        if name.is_null() {
            return None;
        }
        let font = CTFontCreateWithName(name, 12.0, std::ptr::null());
        CFRelease(name);
        if font.is_null() {
            return None;
        }
        let mut matched = false;
        for value in [
            CTFontCopyFamilyName(font),
            CTFontCopyPostScriptName(font),
            CTFontCopyFullName(font),
        ] {
            if value.is_null() {
                continue;
            }
            let mut buffer = [0_u8; 1024];
            if CFStringGetCString(
                value,
                buffer.as_mut_ptr().cast(),
                buffer.len() as isize,
                UTF8,
            ) {
                let end = buffer.iter().position(|&v| v == 0).unwrap_or(buffer.len());
                matched |= String::from_utf8_lossy(&buffer[..end]).eq_ignore_ascii_case(family);
            }
            CFRelease(value);
        }
        CFRelease(font);
        Some(matched)
    }
}

#[cfg(target_os = "windows")]
fn system_family_available(family: &str) -> Option<bool> {
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::BOOL,
            Graphics::DirectWrite::{
                DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED,
            },
        },
    };
    let name: Vec<u16> = family.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).ok()?;
        let mut collection = None;
        factory
            .GetSystemFontCollection(&mut collection, false)
            .ok()?;
        let collection = collection?;
        let mut index = 0;
        let mut exists = BOOL(0);
        collection
            .FindFamilyName(PCWSTR(name.as_ptr()), &mut index, &mut exists)
            .ok()?;
        Some(exists.as_bool())
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn system_family_available(_family: &str) -> Option<bool> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    fn package(parts: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, xml) in parts {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(xml.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
    #[test]
    fn subset_family_normalizes_without_accepting_private_paths() {
        assert_eq!(
            normalize_family("ABCDEF+Noto Sans").as_deref(),
            Some("Noto Sans")
        );
        assert!(normalize_family("/Users/private/font").is_none());
    }
    #[test]
    fn docx_theme_resolves_and_embedding_is_not_assumed_usable() {
        let bytes = package(&[
            (
                "word/document.xml",
                r#"<w:rFonts xmlns:w="w" w:asciiTheme="minorHAnsi"/>"#,
            ),
            (
                "word/theme/theme1.xml",
                r#"<a:minorFont xmlns:a="a"><a:latin typeface="Synthetic Sans"/></a:minorFont>"#,
            ),
            (
                "word/fontTable.xml",
                r#"<w:font xmlns:w="w"><w:embedRegular/></w:font>"#,
            ),
        ]);
        let (families, incomplete, _) = docx_families(Cursor::new(bytes)).unwrap();
        assert_eq!(families, vec!["Synthetic Sans"]);
        assert!(incomplete);
    }
    #[test]
    fn available_subset_family_is_not_confused_with_a_missing_family() {
        #[cfg(target_os = "macos")]
        {
            let result = inspect_families(vec![
                "ABCDEF+Helvetica".into(),
                "Zero Synthetic Missing Font 772901".into(),
            ]);
            assert!(result.available_families.contains(&"Helvetica".to_string()));
            assert_eq!(
                result.missing_families,
                vec!["Zero Synthetic Missing Font 772901"]
            );
        }
    }
    #[test]
    fn embedded_declaration_is_a_candidate_until_the_renderer_loads_it() {
        let bytes = package(&[
            (
                "word/document.xml",
                r#"<w:rFonts xmlns:w="w" w:ascii="Synthetic Embedded"/>"#,
            ),
            (
                "word/fontTable.xml",
                r#"<w:fonts xmlns:w="w"><w:font w:name="Synthetic Embedded"><w:embedRegular/></w:font></w:fonts>"#,
            ),
        ]);
        let (families, incomplete, embedded) = docx_families(Cursor::new(bytes)).unwrap();
        assert_eq!(families, vec!["Synthetic Embedded"]);
        assert_eq!(embedded, vec!["Synthetic Embedded"]);
        assert!(!incomplete);
    }

    #[test]
    fn html_chunks_and_unrendered_embedded_objects_fail_before_rendering() {
        for content in [
            "<w:altChunk xmlns:w=\"w\"/>",
            "<w:object xmlns:w=\"w\"/>",
            "<c:chart xmlns:c=\"c\"/>",
        ] {
            let bytes = package(&[("word/document.xml", content)]);
            assert_eq!(
                docx_families(Cursor::new(bytes)).unwrap_err(),
                "unsupportedInput"
            );
        }
    }
    #[test]
    fn external_images_fail_before_renderer_can_fetch_them() {
        let bytes = package(&[(
            "word/_rels/document.xml.rels",
            r#"<Relationship TargetMode="External" Type="http://example/image" Target="https://private.invalid"/>"#,
        )]);
        assert_eq!(
            docx_families(Cursor::new(bytes)).unwrap_err(),
            "unsupportedInput"
        );
    }
    #[test]
    fn css_generic_families_are_unresolved_aliases_not_missing_system_fonts() {
        let inspection = inspect_families(vec![
            "sans-serif".into(),
            "SERIF".into(),
            "system-ui".into(),
        ]);
        assert!(inspection.incomplete);
        assert!(inspection.available_families.is_empty());
        assert!(inspection.missing_families.is_empty());
    }

    #[test]
    fn theme_reference_overrides_unused_explicit_family() {
        let bytes = package(&[
            (
                "word/document.xml",
                r#"<w:rFonts xmlns:w="w" w:ascii="Unused Missing Font" w:asciiTheme="minorHAnsi"/>"#,
            ),
            (
                "word/theme/theme1.xml",
                r#"<a:minorFont xmlns:a="a"><a:latin typeface="Synthetic Theme"/></a:minorFont>"#,
            ),
        ]);
        let (families, incomplete, _) = docx_families(Cursor::new(bytes)).unwrap();
        assert_eq!(families, vec!["Synthetic Theme"]);
        assert!(!incomplete);
    }

    #[test]
    fn oversized_family_lists_report_incomplete_not_all_available() {
        let inspection = inspect_families(vec!["/private/font".into(); 101]);
        assert!(inspection.incomplete);
        assert!(inspection.available_families.is_empty());
    }
}
