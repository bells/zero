use semver::{Comparator, Op, Version, VersionReq};

pub fn is_protocol_version(value: &str) -> bool {
    Version::parse(value).is_ok_and(|v| {
        [v.major, v.minor, v.patch]
            .iter()
            .all(|n| *n <= 9_007_199_254_740_991)
    })
}

/// Restrict grammar here; leave SemVer ordering and prerelease rules to semver.
pub fn protocol_range(value: &str) -> Option<VersionReq> {
    let tokens: Vec<_> = value.split(' ').collect();
    let mut bounded = false;
    let mut comparators = Vec::new();
    for token in &tokens {
        let (operator, version) = [">=", "<=", ">", "<", "=", "^", "~"]
            .into_iter()
            .find_map(|operator| token.strip_prefix(operator).map(|v| (operator, v)))
            .unwrap_or(("=", token));
        if !is_protocol_version(version) {
            return None;
        }
        if tokens.len() > 1 && matches!(operator, "^" | "~") {
            return None;
        }
        let comparator = Comparator::parse(&format!("{operator}{version}")).ok()?;
        bounded |= matches!(
            comparator.op,
            Op::Exact | Op::Caret | Op::Tilde | Op::Less | Op::LessEq
        );
        comparators.push(comparator);
    }
    bounded.then_some(VersionReq { comparators })
}

pub fn protocol_version_matches(version: &str, range: &str) -> bool {
    if !is_protocol_version(version) {
        return false;
    }
    Version::parse(version)
        .ok()
        .zip(protocol_range(range))
        .is_some_and(|(version, range)| range.matches(&version))
}

pub fn legacy_host_matches(version: &str, range: &str) -> bool {
    if range == "*" {
        return true;
    }
    if let Some(minimum) = range.strip_prefix(">=") {
        return Version::parse(version)
            .ok()
            .zip(Version::parse(minimum).ok())
            .is_some_and(|(version, minimum)| version.pre.is_empty() && version >= minimum);
    }
    protocol_version_matches(version, range)
}
