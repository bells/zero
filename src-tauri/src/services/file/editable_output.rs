use std::fs::File;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::name::ResolveResult;
use quick_xml::NsReader;
use zip::ZipArchive;

use super::contracts::{FileConversionError, FileConversionErrorCode};

const WORD_NAMESPACE: &[u8] = b"http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MAX_XML_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 128 * 1024 * 1024;

pub fn commit_editable_docx(
    job_directory: &Path,
    output: &Path,
    destination: &Path,
    job_id: &str,
) -> Result<(), FileConversionError> {
    validate_editable_docx(output)?;
    super::artifacts::commit_provider_output(
        job_directory,
        output,
        destination,
        super::contracts::FileConversionDirection::PdfToDocx,
        job_id,
    )
}

pub fn validate_editable_docx(path: &Path) -> Result<(), FileConversionError> {
    let result = (|| -> Result<(), ()> {
        let file = File::open(path).map_err(|_| ())?;
        if file.metadata().map_err(|_| ())?.len() > MAX_PACKAGE_BYTES {
            return Err(());
        }
        let mut archive = ZipArchive::new(file).map_err(|_| ())?;
        if archive.len() > 4096 {
            return Err(());
        }
        let mut expanded = 0_u64;
        for index in 0..archive.len() {
            expanded = expanded
                .checked_add(archive.by_index(index).map_err(|_| ())?.size())
                .ok_or(())?;
            if expanded > MAX_PACKAGE_BYTES {
                return Err(());
            }
        }
        let document = archive.by_name("word/document.xml").map_err(|_| ())?;
        if document.size() > MAX_XML_BYTES {
            return Err(());
        }
        let mut xml = Vec::new();
        document
            .take(MAX_XML_BYTES + 1)
            .read_to_end(&mut xml)
            .map_err(|_| ())?;
        if xml.len() as u64 > MAX_XML_BYTES {
            return Err(());
        }
        if !has_visible_body_text(&xml)? {
            return Err(());
        }
        Ok(())
    })();
    result.map_err(|_| FileConversionError {
        code: FileConversionErrorCode::InvalidProviderOutput,
        message: "The built-in PDF conversion did not produce valid visible editable body text."
            .into(),
        retryable: false,
        provider_id: None,
        diagnostic: None,
    })
}

fn has_visible_body_text(xml: &[u8]) -> Result<bool, ()> {
    let mut reader = NsReader::from_reader(xml);
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut visible = false;
    let mut run_text = false;
    let mut run_hidden = false;
    loop {
        let (namespace, event) = reader.read_resolved_event().map_err(|_| ())?;
        let word = matches!(namespace, ResolveResult::Bound(ns) if ns.as_ref() == WORD_NAMESPACE);
        match event {
            Event::Start(element) => {
                if stack.len() >= 128 {
                    return Err(());
                }
                let name = if word {
                    element.local_name().as_ref().to_vec()
                } else {
                    Vec::new()
                };
                if name == b"r" {
                    run_text = false;
                    run_hidden = false;
                }
                if matches!(name.as_slice(), b"vanish" | b"webHidden" | b"specVanish") {
                    run_hidden = true;
                }
                stack.push(name);
            }
            Event::Empty(element) => {
                if word
                    && matches!(
                        element.local_name().as_ref(),
                        b"vanish" | b"webHidden" | b"specVanish"
                    )
                {
                    run_hidden = true;
                }
            }
            Event::Text(text) => {
                if stack.last().is_some_and(|name| name == b"t")
                    && stack.iter().any(|name| name == b"body")
                    && stack.iter().any(|name| name == b"p")
                    && stack.iter().any(|name| name == b"r")
                    && !stack
                        .iter()
                        .any(|name| matches!(name.as_slice(), b"del" | b"txbxContent"))
                    && !text.xml_content().map_err(|_| ())?.trim().is_empty()
                {
                    run_text = true;
                }
            }
            Event::End(_) => {
                if stack.pop().ok_or(())? == b"r" {
                    visible |= run_text && !run_hidden;
                }
            }
            Event::DocType(_) => return Err(()),
            Event::Eof => break,
            _ => {}
        }
    }
    if !stack.is_empty() {
        return Err(());
    }
    Ok(visible)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn document(body: &str) -> Vec<u8> {
        format!(
            "<w:document xmlns:w=\"{}\"><w:body>{body}</w:body></w:document>",
            std::str::from_utf8(WORD_NAMESPACE).unwrap()
        )
        .into_bytes()
    }

    #[test]
    fn accepts_visible_body_runs_but_not_hidden_images_or_attributes() {
        assert!(
            has_visible_body_text(&document("<w:p><w:r><w:t>Hello 中文</w:t></w:r></w:p>"))
                .unwrap()
        );
        for body in [
            "<w:p><w:r><w:drawing/></w:r></w:p>",
            "<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>hidden</w:t></w:r></w:p>",
            "<w:p><w:r><w:rPr><w:webHidden/></w:rPr><w:t>hidden</w:t></w:r></w:p>",
            "<w:p text=\"fake\"><w:r><w:t> </w:t></w:r></w:p>",
            "<w:p><w:del><w:r><w:t>deleted</w:t></w:r></w:del></w:p>",
        ] {
            assert!(!has_visible_body_text(&document(body)).unwrap());
        }
        assert!(!has_visible_body_text(
            b"<document><body><p><r><t>fake</t></r></p></body></document>"
        )
        .unwrap());
    }

    #[test]
    fn rejects_malformed_deep_and_oversized_packages() {
        assert!(has_visible_body_text(b"<w:document><x></w:document>").is_err());
        let deep = format!("{}{}", "<a>".repeat(130), "</a>".repeat(130));
        assert!(has_visible_body_text(deep.as_bytes()).is_err());
        let path = std::env::temp_dir().join(format!("zero-editable-{}.docx", std::process::id()));
        let mut archive = zip::ZipWriter::new(File::create(&path).unwrap());
        archive
            .start_file(
                "word/document.xml",
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
            )
            .unwrap();
        archive
            .write_all(&vec![b' '; MAX_XML_BYTES as usize + 1])
            .unwrap();
        archive.finish().unwrap();
        assert_eq!(
            validate_editable_docx(&path).unwrap_err().code,
            FileConversionErrorCode::InvalidProviderOutput
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn invalid_semantics_never_commit_or_replace_existing_files_and_next_job_can_commit() {
        let root =
            std::env::temp_dir().join(format!("zero-editable-commit-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let temp = root.join("staging");
        let source = root.join("source.pdf");
        std::fs::write(&source, b"%PDF-1.7 fixture").unwrap();
        let destination = root.join("result.docx");
        std::fs::write(&destination, b"existing output").unwrap();
        for (id, body, valid) in [
            ("image-only", "<w:p><w:r><w:drawing/></w:r></w:p>", false),
            (
                "next-text",
                "<w:p><w:r><w:t>Editable</w:t></w:r></w:p>",
                true,
            ),
        ] {
            let job = super::super::artifacts::create_job_temp_directory(&temp, id).unwrap();
            let output = job.join("provider.docx");
            let mut archive = zip::ZipWriter::new(File::create(&output).unwrap());
            archive
                .start_file("[Content_Types].xml", SimpleFileOptions::default())
                .unwrap();
            archive.write_all(b"<Types/>").unwrap();
            archive
                .start_file("word/document.xml", SimpleFileOptions::default())
                .unwrap();
            archive.write_all(&document(body)).unwrap();
            archive.finish().unwrap();
            let target = if valid {
                root.join("next.docx")
            } else {
                destination.clone()
            };
            let result = commit_editable_docx(&job, &output, &target, id);
            if valid {
                result.unwrap();
                assert!(target.is_file());
            } else {
                assert_eq!(
                    result.unwrap_err().code,
                    FileConversionErrorCode::InvalidProviderOutput
                );
            }
            super::super::artifacts::remove_job_temp_directory(&temp, &job).unwrap();
            assert!(!job.exists());
        }
        assert_eq!(std::fs::read(source).unwrap(), b"%PDF-1.7 fixture");
        assert_eq!(std::fs::read(destination).unwrap(), b"existing output");
        std::fs::remove_dir_all(root).unwrap();
    }
}
