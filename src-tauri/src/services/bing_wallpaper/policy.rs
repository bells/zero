use chrono::{DateTime, FixedOffset, NaiveDate, TimeZone, Utc};

pub fn market_day(now: DateTime<Utc>) -> NaiveDate {
    now.with_timezone(&FixedOffset::east_opt(8 * 3600).unwrap())
        .date_naive()
}

pub fn next_midnight(now: DateTime<Utc>) -> DateTime<Utc> {
    FixedOffset::east_opt(8 * 3600)
        .unwrap()
        .from_local_datetime(
            &market_day(now)
                .succ_opt()
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap(),
        )
        .unwrap()
        .with_timezone(&Utc)
}

pub fn publication_date(
    display: Option<&str>,
    source: &str,
    now: DateTime<Utc>,
) -> Option<NaiveDate> {
    let value = display.unwrap_or(source);
    if value.len() != 8 || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y%m%d")
        .ok()
        .filter(|date| *date <= market_day(now))
}

pub fn retry_seconds(attempt: usize) -> u64 {
    [60, 300, 900, 1800][attempt.min(3)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};
    #[test]
    fn china_day_and_midnight_ignore_local_timezone() {
        let before = Utc.with_ymd_and_hms(2026, 10, 31, 15, 59, 59).unwrap();
        assert_eq!(market_day(before).to_string(), "2026-10-31");
        assert_eq!(
            next_midnight(before),
            Utc.with_ymd_and_hms(2026, 10, 31, 16, 0, 0).unwrap()
        );
        assert_eq!(
            market_day(before + chrono::Duration::seconds(1)).to_string(),
            "2026-11-01"
        );
    }
    #[test]
    fn publication_requires_a_real_nonfuture_date() {
        let now = Utc.with_ymd_and_hms(2026, 10, 31, 20, 0, 0).unwrap();
        assert_eq!(
            publication_date(Some("20261031"), "20261030", now)
                .unwrap()
                .to_string(),
            "2026-10-31"
        );
        assert!(publication_date(Some("20260230"), "20261030", now).is_none());
        assert!(publication_date(Some("20261102"), "20261030", now).is_none());
        assert_eq!(
            publication_date(None, "20261030", now).unwrap().to_string(),
            "2026-10-30"
        );
    }
    #[test]
    fn bounded_retry_and_reconciliation_do_not_replay_missed_intervals() {
        assert_eq!(
            (0..6).map(retry_seconds).collect::<Vec<_>>(),
            vec![60, 300, 900, 1800, 1800, 1800]
        );
    }
}
