use super::*;

const OPTIONS: TransformOptions = TransformOptions {
    case: TextCase::Lowercase,
    whitespace: Whitespace::Collapse,
};

const POLICY: QueryPolicy = QueryPolicy {
    transform: OPTIONS,
    case_matching: FuzzyCase::Ignore,
    normalization: FuzzyNormalization::Smart,
    mode: FuzzyMode::Text,
    tiers: TierCoefficients {
        exact: 4,
        prefix: 3,
        substring: 2,
        fuzzy: 1,
    },
    tier_weight: 100,
    fuzzy_weight: 0,
};

fn field<'a>(key: &'a str, text: &'a str, bonus: u64) -> MatchField<'a> {
    MatchField { key, text, bonus }
}

fn document<'a>(id: &'a str, fields: &'a [MatchField<'a>]) -> Document<'a> {
    Document {
        id,
        fields,
        base_score: 0,
        tie_recency: 0,
        sort_key: "",
    }
}

fn search<'a>(
    query: &str,
    documents: &[Document<'a>],
) -> Result<Vec<SearchHit<'a>>, TextSearchError> {
    rank_text(query, 50, documents, POLICY, || false)
}

fn ids<'a>(hits: &[SearchHit<'a>]) -> Vec<&'a str> {
    hits.iter().map(|hit| hit.id).collect()
}

#[test]
fn caller_field_bonus_changes_winner_and_first_field_breaks_a_score_tie() {
    let literal = [field("title", "echo", 0)];
    let alternative = [field("other-name", "echo utility", 0)];
    let boosted = [
        field("other-name", "echo utility", 101),
        field("second-name", "echo utility", 101),
    ];
    let unweighted = [document("a", &literal), document("b", &alternative)];
    assert_eq!(ids(&search("echo", &unweighted).unwrap()), ["a", "b"]);

    let weighted = [document("a", &literal), document("b", &boosted)];
    let hits = search("echo", &weighted).unwrap();
    assert_eq!(ids(&hits), ["b", "a"]);
    assert_eq!(hits[0].score, 401);
    let winner = hits[0].evidence.unwrap();
    assert_eq!(winner.field_key, "other-name");
    assert_eq!(winner.field_index, 0);
}

#[test]
fn nonempty_evidence_reports_all_tiers_and_formula_inputs() {
    let examples = [
        ("exact", "echo"),
        ("prefix", "echo lab"),
        ("substring", "an echo lab"),
        ("fuzzy", "e c h o"),
        ("absent", "xyz"),
    ];
    let fields = examples.map(|(_, text)| [field("label", text, 3)]);
    let documents: Vec<_> = examples
        .iter()
        .zip(&fields)
        .map(|((id, _), fields)| Document {
            base_score: 9,
            ..document(id, fields)
        })
        .collect();
    let policy = QueryPolicy {
        fuzzy_weight: 2,
        tier_weight: 10_000,
        ..POLICY
    };
    let hits = rank_text("  ECHO  ", 50, &documents, policy, || false).unwrap();
    assert_eq!(ids(&hits), ["exact", "prefix", "substring", "fuzzy"]);
    for (hit, (tier, tier_component)) in hits.iter().zip([
        (MatchTier::Exact, 40_000),
        (MatchTier::Prefix, 30_000),
        (MatchTier::Substring, 20_000),
        (MatchTier::Fuzzy, 10_000),
    ]) {
        let evidence = hit.evidence.unwrap();
        assert_eq!(evidence.field_key, "label");
        assert_eq!(evidence.tier, tier);
        assert!(evidence.fuzzy_score > 0);
        assert_eq!(
            hit.score,
            tier_component + 2 * u64::from(evidence.fuzzy_score) + 3 + 9
        );
    }
}

#[test]
fn empty_query_uses_only_base_score_and_caller_ties() {
    let ignored = [field("ignored", "anything", 9_000)];
    let mut documents = [
        document("old", &ignored),
        document("z", &[]),
        document("c", &[]),
        document("b", &[]),
        document("winner", &[]),
    ];
    documents[0].sort_key = "art";
    documents[1].tie_recency = 1;
    documents[1].sort_key = "b";
    documents[2].tie_recency = 1;
    documents[2].sort_key = "a";
    documents[3].tie_recency = 1;
    documents[3].sort_key = "a";
    documents[4].base_score = 1;
    let hits = search(" \t\u{2003}", &documents).unwrap();
    assert_eq!(ids(&hits), ["winner", "b", "c", "z", "old"]);
    assert!(hits.iter().all(|hit| hit.evidence.is_none()));
    assert_eq!(
        hits.iter().map(|hit| hit.score).collect::<Vec<_>>(),
        [1, 0, 0, 0, 0]
    );

    let hits = rank_text("", 2, &documents, POLICY, || false).unwrap();
    assert_eq!(ids(&hits), ["winner", "b"]);
}

#[test]
fn an_alias_only_matches_when_supplied() {
    let official_name = [field("title", "google chrome", 40)];
    let explicitly_supplied = [
        field("title", "google chrome", 40),
        field("alias", "browser", 34),
    ];
    assert!(search("browser", &[document("a", &official_name)])
        .unwrap()
        .is_empty());
    let hits = search("browser", &[document("a", &explicitly_supplied)]).unwrap();
    assert_eq!(
        hits.first()
            .and_then(|hit| hit.evidence)
            .map(|evidence| evidence.field_key),
        Some("alias")
    );
}

#[test]
fn transformation_applies_explicit_case_and_whitespace_with_mixed_pinyin() {
    let lower = transform_text("  微信\u{2003}TEAM-42 \t", OPTIONS, || false).unwrap();
    assert_eq!(lower.normalized, "微信 team-42");
    assert_eq!(lower.word_initials, "微t4");
    assert_eq!(lower.pinyin_full, "weixinteam42");
    assert_eq!(lower.pinyin_initials, "wx");

    let preserve = transform_text(
        "  重慶\tTEAM \n",
        TransformOptions {
            case: TextCase::Preserve,
            whitespace: Whitespace::Preserve,
        },
        || false,
    )
    .unwrap();
    assert_eq!(preserve.normalized, "  重慶\tTEAM \n");
    assert_eq!(preserve.word_initials, "重T");
    assert_eq!(preserve.pinyin_full, "zhongqingTEAM");
    assert_eq!(preserve.pinyin_initials, "zq");

    let lower = transform_text("  VISUAL Studio\nCode ", OPTIONS, || false).unwrap();
    assert_eq!(lower.normalized, "visual studio code");
    assert_eq!(lower.word_initials, "vsc");
    assert_eq!(lower.pinyin_full, "visualstudiocode");
    assert_eq!(lower.pinyin_initials, "");
}

#[test]
fn fuzzy_case_and_normalization_are_selected_by_the_caller() {
    let case_fields = [field("label", "ECHO", 0)];
    let accent_fields = [field("label", "café", 0)];
    let documents = [
        document("case", &case_fields),
        document("accent", &accent_fields),
    ];
    let restricted = QueryPolicy {
        case_matching: FuzzyCase::Respect,
        normalization: FuzzyNormalization::Never,
        ..POLICY
    };
    for (query, matching_id) in [("echo", "case"), ("cafe", "accent")] {
        assert!(rank_text(query, 50, &documents, restricted, || false)
            .unwrap()
            .is_empty());
        let hits = search(query, &documents).unwrap();
        assert_eq!(ids(&hits), [matching_id]);
        assert_eq!(hits[0].evidence.unwrap().tier, MatchTier::Fuzzy);
    }
}

#[test]
fn fuzzy_mode_changes_boundary_bonuses_without_changing_literal_tier() {
    let fields = [field("label", "echo", 0)];
    let documents = [document("id", &fields)];
    let paths = QueryPolicy {
        mode: FuzzyMode::Paths,
        ..POLICY
    };
    let text = search("echo", &documents).unwrap()[0].evidence.unwrap();
    let paths = rank_text("echo", 1, &documents, paths, || false).unwrap()[0]
        .evidence
        .unwrap();
    assert_eq!(text.tier, MatchTier::Exact);
    assert_eq!(paths.tier, MatchTier::Exact);
    assert!(text.fuzzy_score > paths.fuzzy_score);
}

const DECOMPOSED_TEXT: &str = "a\u{0301}b";
const PRESERVE_TEXT: TransformOptions = TransformOptions {
    case: TextCase::Preserve,
    whitespace: Whitespace::Preserve,
};

#[test]
fn decomposed_unicode_identical_query_has_exact_evidence() {
    let fields = [field("label", DECOMPOSED_TEXT, 0)];
    let documents = [document("id", &fields)];
    for mode in [FuzzyMode::Text, FuzzyMode::Paths] {
        let policy = QueryPolicy {
            transform: PRESERVE_TEXT,
            case_matching: FuzzyCase::Respect,
            normalization: FuzzyNormalization::Never,
            mode,
            ..POLICY
        };
        let hits = rank_text(DECOMPOSED_TEXT, 1, &documents, policy, || false).unwrap();
        assert_eq!(ids(&hits), ["id"], "{mode:?}");
        assert_eq!(hits[0].evidence.unwrap().tier, MatchTier::Exact, "{mode:?}");
    }
}

#[test]
fn decomposed_unicode_fuzzy_score_matches_nucleo_grapheme_reference() {
    let fields = [field("label", DECOMPOSED_TEXT, 0)];
    let documents = [document("id", &fields)];
    let graphemes: Vec<_> = nucleo_matcher::chars::graphemes(DECOMPOSED_TEXT).collect();

    for (mode, config) in [
        (FuzzyMode::Text, Config::DEFAULT),
        (FuzzyMode::Paths, Config::DEFAULT.match_paths()),
    ] {
        for (case_matching, case, query) in [
            (FuzzyCase::Respect, CaseMatching::Respect, "ab"),
            (FuzzyCase::Ignore, CaseMatching::Ignore, "AB"),
        ] {
            for (normalization, nucleo_normalization) in [
                (FuzzyNormalization::Never, Normalization::Never),
                (FuzzyNormalization::Smart, Normalization::Smart),
            ] {
                let policy = QueryPolicy {
                    transform: PRESERVE_TEXT,
                    case_matching,
                    normalization,
                    mode,
                    ..POLICY
                };
                let hits = rank_text(query, 1, &documents, policy, || false).unwrap();
                assert_eq!(ids(&hits), ["id"], "{policy:?}");
                let evidence = hits[0].evidence.unwrap();
                assert_eq!(evidence.tier, MatchTier::Fuzzy, "{policy:?}");

                let pattern = Pattern::new(query, case, nucleo_normalization, AtomKind::Fuzzy);
                let reference = pattern
                    .score(
                        Utf32Str::Unicode(&graphemes),
                        &mut Matcher::new(config.clone()),
                    )
                    .unwrap();
                assert_eq!(evidence.fuzzy_score, reference, "{policy:?}");
            }
        }
    }
}

#[test]
fn preserved_whitespace_without_words_does_not_create_a_wildcard() {
    let policy = QueryPolicy {
        transform: TransformOptions {
            whitespace: Whitespace::Preserve,
            ..OPTIONS
        },
        ..POLICY
    };
    let fields = [field("label", "value", 0)];
    let docs = [document("id", &fields)];
    assert!(rank_text("  ", 1, &docs, policy, || false)
        .unwrap()
        .is_empty());
}

#[test]
fn query_limit_counts_unicode_scalars_before_transforming() {
    let at_limit = "𠀀".repeat(128);
    assert!(search(&at_limit, &[]).unwrap().is_empty());
    assert_eq!(
        search(&(at_limit + "𠀀"), &[]),
        Err(TextSearchError::QueryTooLong)
    );
    assert_eq!(
        search(&" ".repeat(129), &[]),
        Err(TextSearchError::QueryTooLong)
    );
}

#[test]
fn result_document_and_field_counts_have_inclusive_limits() {
    assert_eq!(
        rank_text("", 0, &[], POLICY, || false),
        Err(TextSearchError::InvalidLimit)
    );
    assert_eq!(
        rank_text("", 51, &[], POLICY, || false),
        Err(TextSearchError::InvalidLimit)
    );
    let doc_ids: Vec<_> = (0..10_001).map(|i| i.to_string()).collect();
    let docs: Vec<_> = doc_ids.iter().map(|id| document(id, &[])).collect();
    assert_eq!(search("", &docs[..10_000]).unwrap().len(), 50);
    assert_eq!(search("", &docs), Err(TextSearchError::TooManyDocuments));

    let fields = [field("alias", "a", 0); 17];
    assert_eq!(
        search("a", &[document("small", &fields[..16])])
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        search("a", &[document("large", &fields)]),
        Err(TextSearchError::TooManyFields)
    );
}

#[test]
fn document_ids_are_nonempty_unique_and_bounded_by_utf8_bytes() {
    for id in ["".to_owned(), "𠀀".repeat(64) + "x"] {
        assert_eq!(
            search("", &[document(&id, &[])]),
            Err(TextSearchError::InvalidId)
        );
    }
    let at_limit = "𠀀".repeat(64);
    assert_eq!(
        ids(&search("", &[document(&at_limit, &[])]).unwrap()),
        [at_limit.as_str()]
    );
    let duplicate = [document("same", &[]), document("same", &[])];
    assert_eq!(search("", &duplicate), Err(TextSearchError::DuplicateId));
}

#[test]
fn field_and_transform_enforce_unicode_and_byte_budgets() {
    let at_limit = "𠀀".repeat(2048);
    assert_eq!(
        search("", &[document("ok", &[field("key", &at_limit, 0)])])
            .unwrap()
            .len(),
        1
    );
    for too_long in [at_limit + "𠀀", "x".repeat(2049)] {
        assert_eq!(
            search("", &[document("bad", &[field("key", &too_long, 0)])]),
            Err(TextSearchError::TextTooLong)
        );
        assert_eq!(
            transform_text(&too_long, OPTIONS, || false),
            Err(TextSearchError::TextTooLong)
        );
    }
}

#[test]
fn combined_field_sort_id_and_key_text_has_a_single_utf8_budget() {
    let field_text = "𠀀".repeat(2048);
    let fields = [field("κ", &field_text, 0)];
    let sort_key = "x".repeat(4 * 1024 * 1024 - 8192 - "κ".len() - "a".len());
    let mut doc = Document {
        sort_key: &sort_key,
        ..document("a", &fields)
    };
    assert_eq!(search("", &[doc]).unwrap().len(), 1);
    doc.id = "ab";
    assert_eq!(search("", &[doc]), Err(TextSearchError::TotalTextTooLong));
}

#[test]
fn validates_all_safe_integer_inputs_before_matching_and_checks_results() {
    const MAX: u64 = 9_007_199_254_740_991;
    let fields = [field("title", "abc", MAX)];
    let mut doc = Document {
        base_score: MAX,
        tie_recency: MAX,
        ..document("a", &fields)
    };
    assert_eq!(
        search("", &[doc]).unwrap().first().map(|hit| hit.score),
        Some(MAX)
    );

    for invalid in [
        QueryPolicy {
            tier_weight: MAX + 1,
            ..POLICY
        },
        QueryPolicy {
            fuzzy_weight: MAX + 1,
            ..POLICY
        },
        QueryPolicy {
            tiers: TierCoefficients {
                exact: MAX + 1,
                ..POLICY.tiers
            },
            ..POLICY
        },
        QueryPolicy {
            tiers: TierCoefficients {
                prefix: MAX + 1,
                ..POLICY.tiers
            },
            ..POLICY
        },
        QueryPolicy {
            tiers: TierCoefficients {
                substring: MAX + 1,
                ..POLICY.tiers
            },
            ..POLICY
        },
        QueryPolicy {
            tiers: TierCoefficients {
                fuzzy: MAX + 1,
                ..POLICY.tiers
            },
            ..POLICY
        },
    ] {
        assert_eq!(
            rank_text("", 1, &[], invalid, || false),
            Err(TextSearchError::UnsafeInteger)
        );
    }
    let invalid_fields = [field("title", "miss", MAX + 1)];
    for invalid in [
        Document {
            base_score: MAX + 1,
            ..doc
        },
        Document {
            tie_recency: MAX + 1,
            ..doc
        },
        Document {
            fields: &invalid_fields,
            ..doc
        },
    ] {
        assert_eq!(
            search("abc", &[doc, Document { id: "b", ..invalid }]),
            Err(TextSearchError::UnsafeInteger)
        );
    }

    assert_eq!(search("abc", &[doc]), Err(TextSearchError::ScoreOverflow));
    let no_bonus = [field("title", "abc", 0)];
    doc.fields = &no_bonus;
    for overflow in [
        POLICY, // Best field score + caller base score.
        QueryPolicy {
            tier_weight: MAX,
            ..POLICY
        },
        QueryPolicy {
            fuzzy_weight: MAX,
            ..POLICY
        },
        QueryPolicy {
            tiers: TierCoefficients {
                exact: MAX,
                ..POLICY.tiers
            },
            tier_weight: MAX,
            ..POLICY
        },
    ] {
        assert_eq!(
            rank_text("abc", 1, &[doc], overflow, || false),
            Err(TextSearchError::ScoreOverflow)
        );
    }
}

#[test]
fn cancellation_returns_no_partial_ranking_or_transform() {
    assert_eq!(
        rank_text("q", 0, &[], POLICY, || true),
        Err(TextSearchError::Cancelled)
    );
    let fields = [field("title", "abc", 0)];
    let documents = [document("1", &fields), document("2", &fields)];
    // Seven checks reach the second document after the first has been scored.
    let mut checks = 0;
    let result = rank_text("abc", 50, &documents, POLICY, || {
        checks += 1;
        checks == 7
    });
    assert_eq!(result, Err(TextSearchError::Cancelled));
    assert_eq!(checks, 7);
    assert_eq!(
        transform_text("微信", OPTIONS, || true),
        Err(TextSearchError::Cancelled)
    );
    let mut checks = 0;
    assert_eq!(
        transform_text("微信", OPTIONS, || {
            checks += 1;
            checks == 2
        }),
        Err(TextSearchError::Cancelled)
    );
}

#[cfg(feature = "bundled-tools")]
#[test]
fn synthetic_legacy_search_order_and_evidence_are_reproducible() {
    use crate::services::quick_launcher::contracts::{
        QuickLauncherItemKind, QuickLauncherRunningState, QuickLauncherSearchInput,
    };
    use crate::services::quick_launcher::model::{IndexedItem, LaunchTarget, UsageEntry, UsageMap};
    use crate::services::quick_launcher::search::{
        build_search_fields, default_matcher, search_items,
    };

    const TITLES: [(&str, &str, &[&str], u64, u64, bool, bool); 7] = [
        ("1", "Signal Chat", &["signal"], 6, 11, false, false),
        (
            "2",
            "Visual Studio Code",
            &["code", "vscode"],
            12,
            12,
            true,
            false,
        ),
        ("3", "Code Notes", &["notes"], 0, 0, false, false),
        (
            "4",
            "微信",
            &["wx", "weixin", "wechat"],
            2,
            12,
            false,
            false,
        ),
        ("5", "Network", &["internet"], 0, 0, false, true),
        ("6", "Studio Editor", &["editor"], 31, 0, false, false),
        ("7", "文档 Studio", &["docs"], 0, 0, false, false),
    ];
    let usage: UsageMap = TITLES
        .iter()
        .map(|&(id, _, _, count, last_used_at, _, _)| {
            (
                id.to_owned(),
                UsageEntry {
                    count,
                    last_used_at,
                },
            )
        })
        .collect();
    let legacy_items: Vec<_> = TITLES
        .iter()
        .map(
            |&(id, title, aliases, _, _, running, setting)| IndexedItem {
                id: id.into(),
                kind: if setting {
                    QuickLauncherItemKind::SystemSetting
                } else {
                    QuickLauncherItemKind::Application
                },
                title: title.into(),
                subtitle: String::new(),
                search: build_search_fields(
                    title,
                    aliases.iter().map(|alias| (*alias).to_owned()).collect(),
                ),
                target: LaunchTarget::SystemSetting { uri: String::new() },
                icon_source: None,
                icon_key: None,
                source_modified_at: None,
                running: if running {
                    QuickLauncherRunningState::Running
                } else {
                    QuickLauncherRunningState::NotRunning
                },
            },
        )
        .collect();
    let transforms: Vec<_> = TITLES
        .iter()
        .map(|&(_, title, _, _, _, _, _)| transform_text(title, OPTIONS, || false).unwrap())
        .collect();
    let sort_keys: Vec<_> = TITLES
        .iter()
        .map(|&(_, title, _, _, _, _, _)| title.to_lowercase())
        .collect();
    let fields: Vec<_> = transforms
        .iter()
        .zip(TITLES)
        .map(|(transform, (_, _, aliases, _, _, _, _))| {
            [
                field("title", &transform.normalized, 40),
                field("wordInitials", &transform.word_initials, 30),
                field("pinyin", &transform.pinyin_full, 24),
                field("pinyinInitials", &transform.pinyin_initials, 26),
            ]
            .into_iter()
            .chain(aliases.iter().map(|alias| field("alias", alias, 34)))
            .collect::<Vec<_>>()
        })
        .collect();

    let policy = QueryPolicy {
        mode: FuzzyMode::Paths,
        tier_weight: 1_000_000,
        fuzzy_weight: 100,
        ..POLICY
    };
    let mut matcher = default_matcher();
    for query in [
        "", "code", "vs", "VSC", "studio", "s c", "wx", "weix", "微信", "文档", "network",
        "editor", "missing",
    ] {
        let docs: Vec<_> = TITLES
            .iter()
            .zip(fields.iter().zip(&sort_keys))
            .map(
                |(&(id, _, _, frequency, last_used_at, running, setting), (fields, sort_key))| {
                    Document {
                        id,
                        fields,
                        // Synthetic usage timestamps are from 1970, so elapsed recency adds zero.
                        base_score: u64::from((frequency + 1).ilog2().min(5)) * 6
                            + u64::from(running) * 4
                            + u64::from(setting && query.is_empty()) * 2,
                        tie_recency: last_used_at,
                        sort_key,
                    }
                },
            )
            .collect();
        let legacy = search_items(
            1,
            &legacy_items,
            &usage,
            QuickLauncherSearchInput {
                query: query.into(),
                limit: Some(50),
            },
            &mut matcher,
        )
        .unwrap();
        let hits = rank_text(query, 50, &docs, policy, || false).unwrap();
        let legacy_order: Vec<_> = legacy
            .items
            .iter()
            .map(|item| (item.id.as_str(), item.matched_field.as_str()))
            .collect();
        let hit_order: Vec<_> = hits
            .iter()
            .map(|hit| {
                (
                    hit.id,
                    hit.evidence.map_or("recent", |evidence| evidence.field_key),
                )
            })
            .collect();
        assert_eq!(hit_order, legacy_order, "query={query:?}");
    }
}
