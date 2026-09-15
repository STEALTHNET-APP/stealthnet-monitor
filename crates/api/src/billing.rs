use chrono::{DateTime, Datelike, NaiveDate};

/// `expires_at` is kept as the original calendar anchor for older agents/clients.
/// Never overwrite it with February's clamped day or imply that a bill was paid.
pub fn next_payment(anchor_ms: i64, now_ms: i64) -> Option<i64> {
    let anchor = DateTime::from_timestamp_millis(anchor_ms)?.date_naive();
    let today = DateTime::from_timestamp_millis(now_ms)?.date_naive();
    let due = if anchor >= today {
        anchor
    } else {
        let this_month = monthly_date(today.year(), today.month(), anchor.day())?;
        if this_month >= today {
            this_month
        } else {
            let (year, month) = next_month(today.year(), today.month());
            monthly_date(year, month, anchor.day())?
        }
    };
    Some(due.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis())
}

fn next_month(year: i32, month: u32) -> (i32, u32) {
    if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    }
}

fn monthly_date(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
    let (next_year, next_month) = next_month(year, month);
    let last = NaiveDate::from_ymd_opt(next_year, next_month, 1)?
        .pred_opt()?
        .day();
    NaiveDate::from_ymd_opt(year, month, day.min(last))
}

pub fn reminder_stage(due_ms: i64, now_ms: i64, threshold: f64) -> Option<i64> {
    let days = due_ms.div_euclid(86_400_000) - now_ms.div_euclid(86_400_000);
    [0, 1, 3, threshold.floor() as i64]
        .into_iter()
        .filter(|v| *v >= 0 && *v as f64 <= threshold && days <= *v)
        .min()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ts(s: &str) -> i64 {
        DateTime::parse_from_rfc3339(s).unwrap().timestamp_millis()
    }
    #[test]
    fn monthly_schedule_preserves_anchor_and_handles_leap_years_and_rollover() {
        let anchor = ts("2023-01-31T23:59:59Z");
        for (today, expected) in [
            ("2023-02-01T12:00:00Z", "2023-02-28T00:00:00Z"),
            ("2023-02-28T23:59:59Z", "2023-02-28T00:00:00Z"),
            ("2023-03-01T00:00:00Z", "2023-03-31T00:00:00Z"),
            ("2024-02-01T00:00:00Z", "2024-02-29T00:00:00Z"),
            ("2024-04-30T23:59:59Z", "2024-04-30T00:00:00Z"),
            ("2025-01-01T00:00:00Z", "2025-01-31T00:00:00Z"),
        ] {
            assert_eq!(next_payment(anchor, ts(today)), Some(ts(expected)));
        }
        assert_eq!(
            next_payment(ts("2026-12-15T23:59:59Z"), ts("2026-12-16T00:00:00Z")),
            Some(ts("2027-01-15T00:00:00Z"))
        );
        assert_eq!(
            next_payment(ts("2027-03-15T23:59:59Z"), ts("2026-12-16T00:00:00Z")),
            Some(ts("2027-03-15T00:00:00Z"))
        );
    }
    #[test]
    fn reminders_use_calendar_days_including_whole_payment_day() {
        let due = ts("2026-09-15T00:00:00Z");
        for (date, expected) in [
            ("2026-09-07T23:59:59Z", None),
            ("2026-09-08T00:00:00Z", Some(7)),
            ("2026-09-12T12:00:00Z", Some(3)),
            ("2026-09-14T23:59:59Z", Some(1)),
            ("2026-09-15T00:00:00Z", Some(0)),
            ("2026-09-15T23:59:59Z", Some(0)),
        ] {
            assert_eq!(reminder_stage(due, ts(date), 7.), expected);
        }
        assert_eq!(reminder_stage(due, ts("2026-09-08T00:00:00Z"), 3.), None);
    }
}
