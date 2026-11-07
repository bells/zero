use super::contracts::FileConversionQualityIssue;
use std::collections::BTreeSet;

const LIMIT: usize = 100;
const CODES: &[&str] = &[
    "fontMissing",
    "fontSubstituted",
    "fontInspectionIncomplete",
    "layoutReflowed",
    "tableSimplified",
    "nonEditableGraphic",
    "ocrUsed",
    "ocrLowConfidence",
    "ocrDownsampled",
];

pub fn bounded_quality_issues(
    issues: Vec<FileConversionQualityIssue>,
) -> Result<Vec<FileConversionQualityIssue>, String> {
    if issues.len() > LIMIT {
        return Err("The engine quality report exceeded its detail limit.".into());
    }
    let mut output: Vec<FileConversionQualityIssue> = Vec::new();
    for mut issue in issues {
        if issue.occurrences == 0
            || issue.page_numbers.len() > LIMIT
            || issue.section_indexes.len() > LIMIT
            || issue.font_families.len() > LIMIT
        {
            return Err("The engine quality report exceeded its location limit.".into());
        }
        if !CODES.contains(&issue.code.as_str()) {
            issue.code = "unknown".into();
        }
        if issue
            .page_numbers
            .iter()
            .any(|&page| page == 0 || page > 512)
            || issue.section_indexes.iter().any(|&section| section >= 512)
        {
            return Err("The engine quality report contains an invalid source location.".into());
        }
        if issue
            .font_families
            .iter()
            .any(|family| !safe_font_family(family))
        {
            return Err("The engine quality report contains an invalid font family.".into());
        }
        if let Some(existing) = output
            .iter_mut()
            .find(|existing| existing.code == issue.code)
        {
            existing.occurrences = existing.occurrences.saturating_add(issue.occurrences);
            existing.truncated |= issue.truncated;
            merge(
                &mut existing.page_numbers,
                issue.page_numbers,
                &mut existing.truncated,
            );
            merge(
                &mut existing.section_indexes,
                issue.section_indexes,
                &mut existing.truncated,
            );
            merge(
                &mut existing.font_families,
                issue.font_families,
                &mut existing.truncated,
            );
        } else {
            output.push(issue);
        }
    }
    Ok(output)
}

fn merge<T: Ord>(target: &mut Vec<T>, values: Vec<T>, truncated: &mut bool) {
    let mut set: BTreeSet<T> = std::mem::take(target).into_iter().collect();
    for value in values {
        if set.contains(&value) {
            continue;
        }
        if set.len() < LIMIT {
            set.insert(value);
        } else {
            *truncated = true;
        }
    }
    *target = set.into_iter().collect();
}

pub fn safe_font_family(family: &str) -> bool {
    !family.trim().is_empty()
        && family.chars().count() <= 128
        && !family
            .chars()
            .any(|ch| ch.is_control() || "\\/<>:".contains(ch))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn issue(code: &str, pages: Vec<u32>) -> FileConversionQualityIssue {
        FileConversionQualityIssue {
            code: code.into(),
            page_numbers: pages,
            section_indexes: vec![],
            font_families: vec![],
            occurrences: 1,
            truncated: false,
        }
    }
    #[test]
    fn aggregates_counts_and_truncates_locations_independently() {
        let mut a = issue("ocrUsed", (1..=100).collect());
        a.occurrences = 100;
        let mut b = issue("ocrUsed", (101..=150).collect());
        b.occurrences = 50;
        let out = bounded_quality_issues(vec![a, b]).unwrap();
        assert_eq!(out[0].occurrences, 150);
        assert_eq!(out[0].page_numbers.len(), 100);
        assert!(out[0].truncated);
    }
    #[test]
    fn unknown_codes_are_safe_and_private_paths_are_rejected() {
        assert_eq!(
            bounded_quality_issues(vec![issue("<script>/secret", vec![])]).unwrap()[0].code,
            "unknown"
        );
        let mut unsafe_issue = issue("fontMissing", vec![]);
        unsafe_issue.font_families = vec!["/Users/private/font.ttf".into()];
        assert!(bounded_quality_issues(vec![unsafe_issue]).is_err());
        assert!(bounded_quality_issues(vec![issue("ocrUsed", vec![0])]).is_err());
    }
}

pub fn compatibility_warning_keys(
    issues: &[FileConversionQualityIssue],
    mut keys: Vec<String>,
) -> Vec<String> {
    for issue in issues {
        let key = match issue.code.as_str() {
            "layoutReflowed" | "tableSimplified" => Some("file.quality.structureSimplified"),
            "ocrUsed" => Some("file.quality.ocrUsed"),
            "ocrLowConfidence" => Some("file.quality.ocrLowConfidence"),
            "ocrDownsampled" => Some("file.quality.ocrDownsampled"),
            _ => None,
        };
        if let Some(key) = key {
            if !keys.iter().any(|existing| existing == key) {
                keys.push(key.into());
            }
        }
    }
    keys
}
