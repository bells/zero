//! Bounded, in-memory text transformation and ranking for native host services.
//! The caller owns its document fields, weights and tie-breaking metadata.

use std::{borrow::Cow, cell::RefCell, cmp::Reverse, collections::BTreeSet};

use nucleo_matcher::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use pinyin::ToPinyin;

const MAX_QUERY_CHARS: usize = 128;
const MAX_RESULT_LIMIT: usize = 50;
const MAX_DOCUMENTS: usize = 10_000;
const MAX_FIELDS: usize = 16;
const MAX_ID_BYTES: usize = 256;
const MAX_TEXT_CHARS: usize = 2048;
const MAX_TEXT_BYTES: usize = 8192;
const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

thread_local! {
    static TEXT_MATCHER: RefCell<Matcher> = RefCell::new(Matcher::new(Config::DEFAULT));
    static PATH_MATCHER: RefCell<Matcher> = RefCell::new(Matcher::new(Config::DEFAULT.match_paths()));
}

#[derive(Clone, Copy, Debug)]
pub enum TextCase {
    Preserve,
    Lowercase,
}

#[derive(Clone, Copy, Debug)]
pub enum Whitespace {
    Preserve,
    /// Trim Unicode whitespace and join words with one ASCII space.
    Collapse,
}

#[derive(Clone, Copy, Debug)]
pub struct TransformOptions {
    pub case: TextCase,
    pub whitespace: Whitespace,
}

#[derive(Debug, PartialEq, Eq)]
pub struct TransformedText {
    pub normalized: String,
    pub word_initials: String,
    pub pinyin_full: String,
    pub pinyin_initials: String,
}

#[derive(Clone, Copy, Debug)]
pub enum FuzzyCase {
    Respect,
    Ignore,
}

#[derive(Clone, Copy, Debug)]
pub enum FuzzyNormalization {
    Never,
    /// Use nucleo’s asymmetric normalization for words without accents in the query.
    Smart,
}

#[derive(Clone, Copy, Debug)]
pub enum FuzzyMode {
    Text,
    /// Use nucleo’s path-oriented separator bonuses. Both modes score plain text.
    Paths,
}

#[derive(Clone, Copy, Debug)]
pub struct TierCoefficients {
    pub exact: u64,
    pub prefix: u64,
    pub substring: u64,
    pub fuzzy: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct QueryPolicy {
    /// Applied to the query. The caller prepares each field independently.
    pub transform: TransformOptions,
    /// Controls fuzzy matching. The exact, prefix and substring tiers use literal text.
    pub case_matching: FuzzyCase,
    pub normalization: FuzzyNormalization,
    pub mode: FuzzyMode,
    pub tiers: TierCoefficients,
    pub tier_weight: u64,
    pub fuzzy_weight: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct MatchField<'a> {
    /// A caller label. Multiple fields may share a key.
    pub key: &'a str,
    pub text: &'a str,
    pub bonus: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct Document<'a> {
    pub id: &'a str,
    pub fields: &'a [MatchField<'a>],
    pub base_score: u64,
    /// An opaque caller-provided tie value. Larger values sort first.
    pub tie_recency: u64,
    pub sort_key: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchTier {
    Exact,
    Prefix,
    Substring,
    Fuzzy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MatchEvidence<'a> {
    pub field_key: &'a str,
    pub field_index: usize,
    pub tier: MatchTier,
    pub fuzzy_score: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SearchHit<'a> {
    pub id: &'a str,
    pub score: u64,
    pub evidence: Option<MatchEvidence<'a>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextSearchError {
    Cancelled,
    QueryTooLong,
    InvalidLimit,
    TooManyDocuments,
    InvalidId,
    DuplicateId,
    TooManyFields,
    TextTooLong,
    TotalTextTooLong,
    UnsafeInteger,
    ScoreOverflow,
}

/// Ranks up to `limit` hits by descending score and tie value, then ascending
/// sort key and ID using Rust string order. Cancellation and errors discard all hits.
pub fn rank_text<'a>(
    query: &str,
    limit: usize,
    documents: &[Document<'a>],
    policy: QueryPolicy,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<Vec<SearchHit<'a>>, TextSearchError> {
    check_cancelled(&mut is_cancelled)?;
    validate_input(query, limit, documents, policy, &mut is_cancelled)?;
    check_cancelled(&mut is_cancelled)?;

    let query = normalize_text(query, policy.transform);
    let mut scorer = Scorer::new(&query, policy);
    let mut ranked = Vec::new();
    for document in documents {
        check_cancelled(&mut is_cancelled)?;
        if let Some(hit) = scorer.rank_document(document, &mut is_cancelled)? {
            ranked.push((document, hit));
        }
    }

    check_cancelled(&mut is_cancelled)?;
    ranked.sort_unstable_by_key(|(doc, hit)| {
        (
            Reverse(hit.score),
            Reverse(doc.tie_recency),
            doc.sort_key,
            doc.id,
        )
    });
    let hits = ranked.into_iter().take(limit).map(|(_, hit)| hit).collect();
    check_cancelled(&mut is_cancelled)?;
    Ok(hits)
}

/// Returns normalized text, alphanumeric word initials and plain pinyin. For
/// supported Han characters the pinyin crate supplies one syllable per character.
/// Full pinyin also retains ASCII alphanumeric characters in the selected case.
/// Pinyin initials contain the first letter of each Han syllable, in input order.
pub fn transform_text(
    value: &str,
    options: TransformOptions,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<TransformedText, TextSearchError> {
    check_cancelled(&mut is_cancelled)?;
    validate_text(value)?;
    let normalized = normalize_text(value, options);
    let word_initials = normalized
        .split(|character: char| !character.is_alphanumeric())
        .filter_map(|word| word.chars().next())
        .collect();

    let mut pinyin_full = String::new();
    let mut pinyin_initials = String::new();
    for character in value.chars() {
        if let Some(pinyin) = character.to_pinyin() {
            pinyin_full.push_str(pinyin.plain());
            pinyin_initials.push_str(pinyin.first_letter());
        } else if character.is_ascii_alphanumeric() {
            pinyin_full.push(match options.case {
                TextCase::Preserve => character,
                TextCase::Lowercase => character.to_ascii_lowercase(),
            });
        }
    }
    check_cancelled(&mut is_cancelled)?;
    Ok(TransformedText {
        normalized,
        word_initials,
        pinyin_full,
        pinyin_initials,
    })
}

fn normalize_text(value: &str, options: TransformOptions) -> String {
    let text = match options.case {
        TextCase::Preserve => Cow::Borrowed(value),
        TextCase::Lowercase => Cow::Owned(value.to_lowercase()),
    };
    match options.whitespace {
        Whitespace::Preserve => text.into_owned(),
        Whitespace::Collapse => text.split_whitespace().collect::<Vec<_>>().join(" "),
    }
}

fn validate_input(
    query: &str,
    limit: usize,
    documents: &[Document<'_>],
    policy: QueryPolicy,
    is_cancelled: &mut impl FnMut() -> bool,
) -> Result<(), TextSearchError> {
    if query.chars().take(MAX_QUERY_CHARS + 1).count() > MAX_QUERY_CHARS {
        return Err(TextSearchError::QueryTooLong);
    }
    if !(1..=MAX_RESULT_LIMIT).contains(&limit) {
        return Err(TextSearchError::InvalidLimit);
    }
    if documents.len() > MAX_DOCUMENTS {
        return Err(TextSearchError::TooManyDocuments);
    }
    validate_integers([
        policy.tiers.exact,
        policy.tiers.prefix,
        policy.tiers.substring,
        policy.tiers.fuzzy,
        policy.tier_weight,
        policy.fuzzy_weight,
    ])?;

    let mut seen_ids = BTreeSet::new();
    let mut total_bytes = 0;
    for document in documents {
        check_cancelled(is_cancelled)?;
        if document.id.is_empty() || document.id.len() > MAX_ID_BYTES {
            return Err(TextSearchError::InvalidId);
        }
        if !seen_ids.insert(document.id) {
            return Err(TextSearchError::DuplicateId);
        }
        if document.fields.len() > MAX_FIELDS {
            return Err(TextSearchError::TooManyFields);
        }
        validate_integers([document.base_score, document.tie_recency])?;
        account_text(&mut total_bytes, [document.id, document.sort_key])?;
        for field in document.fields {
            validate_text(field.text)?;
            validate_integers([field.bonus])?;
            account_text(&mut total_bytes, [field.key, field.text])?;
        }
    }
    Ok(())
}

fn check_cancelled(is_cancelled: &mut impl FnMut() -> bool) -> Result<(), TextSearchError> {
    if is_cancelled() {
        return Err(TextSearchError::Cancelled);
    }
    Ok(())
}

fn validate_text(text: &str) -> Result<(), TextSearchError> {
    if text.len() > MAX_TEXT_BYTES || text.chars().count() > MAX_TEXT_CHARS {
        return Err(TextSearchError::TextTooLong);
    }
    Ok(())
}

fn account_text<const N: usize>(
    total: &mut usize,
    strings: [&str; N],
) -> Result<(), TextSearchError> {
    for value in strings {
        *total = total
            .checked_add(value.len())
            .filter(|&sum| sum <= MAX_TOTAL_BYTES)
            .ok_or(TextSearchError::TotalTextTooLong)?;
    }
    Ok(())
}

fn validate_integers<const N: usize>(values: [u64; N]) -> Result<(), TextSearchError> {
    if values.into_iter().any(|value| value > MAX_SAFE_INTEGER) {
        return Err(TextSearchError::UnsafeInteger);
    }
    Ok(())
}

struct Scorer<'a> {
    query: &'a str,
    pattern: Pattern,
    policy: QueryPolicy,
    buffer: Vec<char>,
}

impl<'a> Scorer<'a> {
    fn new(query: &'a str, policy: QueryPolicy) -> Self {
        let case = match policy.case_matching {
            FuzzyCase::Respect => CaseMatching::Respect,
            FuzzyCase::Ignore => CaseMatching::Ignore,
        };
        let normalization = match policy.normalization {
            FuzzyNormalization::Never => Normalization::Never,
            FuzzyNormalization::Smart => Normalization::Smart,
        };
        let pattern = Pattern::new(query, case, normalization, AtomKind::Fuzzy);
        Self {
            query,
            pattern,
            policy,
            buffer: Vec::new(),
        }
    }

    fn rank_document<'doc>(
        &mut self,
        document: &Document<'doc>,
        is_cancelled: &mut impl FnMut() -> bool,
    ) -> Result<Option<SearchHit<'doc>>, TextSearchError> {
        let mut hit = SearchHit {
            id: document.id,
            score: document.base_score,
            evidence: None,
        };
        if self.query.is_empty() {
            return Ok(Some(hit));
        }
        if self.pattern.atoms.is_empty() {
            return Ok(None);
        }

        let mut best = None;
        for (field_index, field) in document.fields.iter().enumerate() {
            check_cancelled(is_cancelled)?;
            let Some(fuzzy_score) = self.fuzzy_score(field.text) else {
                continue;
            };
            let (tier, coefficient) = self.tier_for(field.text);
            let score = self.field_score(coefficient, fuzzy_score, field.bonus)?;
            if best
                .as_ref()
                .is_none_or(|&(best_score, _)| score > best_score)
            {
                best = Some((
                    score,
                    MatchEvidence {
                        field_key: field.key,
                        field_index,
                        tier,
                        fuzzy_score,
                    },
                ));
            }
        }
        let Some((score, evidence)) = best else {
            return Ok(None);
        };
        hit.score = score
            .checked_add(document.base_score)
            .filter(|&sum| sum <= MAX_SAFE_INTEGER)
            .ok_or(TextSearchError::ScoreOverflow)?;
        hit.evidence = Some(evidence);
        Ok(Some(hit))
    }

    fn fuzzy_score(&mut self, text: &str) -> Option<u32> {
        if text.is_empty() {
            return None;
        }
        let matcher = match self.policy.mode {
            FuzzyMode::Text => &TEXT_MATCHER,
            FuzzyMode::Paths => &PATH_MATCHER,
        };
        let haystack = if text.is_ascii() {
            Utf32Str::Ascii(text.as_bytes())
        } else {
            // Nucleo 0.3.1's constructor can return raw UTF-8 bytes in its ASCII
            // variant when every grapheme head is ASCII.
            self.buffer.clear();
            self.buffer.extend(nucleo_matcher::chars::graphemes(text));
            Utf32Str::Unicode(&self.buffer)
        };
        matcher.with(|matcher| self.pattern.score(haystack, &mut matcher.borrow_mut()))
    }

    fn tier_for(&self, text: &str) -> (MatchTier, u64) {
        let tiers = self.policy.tiers;
        if text == self.query {
            (MatchTier::Exact, tiers.exact)
        } else if text.starts_with(self.query) {
            (MatchTier::Prefix, tiers.prefix)
        } else if text.contains(self.query) {
            (MatchTier::Substring, tiers.substring)
        } else {
            (MatchTier::Fuzzy, tiers.fuzzy)
        }
    }

    fn field_score(
        &self,
        coefficient: u64,
        fuzzy_score: u32,
        bonus: u64,
    ) -> Result<u64, TextSearchError> {
        let tier_score = coefficient
            .checked_mul(self.policy.tier_weight)
            .ok_or(TextSearchError::ScoreOverflow)?;
        u64::from(fuzzy_score)
            .checked_mul(self.policy.fuzzy_weight)
            .and_then(|fuzzy| fuzzy.checked_add(tier_score))
            .and_then(|score| score.checked_add(bonus))
            .filter(|&score| score <= MAX_SAFE_INTEGER)
            .ok_or(TextSearchError::ScoreOverflow)
    }
}

#[cfg(test)]
mod tests;
