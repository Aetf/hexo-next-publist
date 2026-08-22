//! Date handling matching the moment.js calls the tag logic used to make.
//! All dates are naive UTC.

use chrono::{Datelike, NaiveDate, NaiveDateTime};

/// moment.utc(s, ['YYYY-MM-DD', 'YYYY-MM', 'YYYY'], true) — strict formats,
/// as used for the bib `date` field (caller already split off a range end).
pub fn parse_bib_date(s: &str) -> Option<NaiveDateTime> {
    let b = s.as_bytes();
    let all_digits = |r: &[u8]| r.iter().all(u8::is_ascii_digit);
    match b.len() {
        10 if b[4] == b'-' && b[7] == b'-' && all_digits(&b[..4]) && all_digits(&b[5..7]) && all_digits(&b[8..]) => {
            NaiveDate::from_ymd_opt(s[..4].parse().ok()?, s[5..7].parse().ok()?, s[8..].parse().ok()?)
        }
        7 if b[4] == b'-' && all_digits(&b[..4]) && all_digits(&b[5..]) => {
            NaiveDate::from_ymd_opt(s[..4].parse().ok()?, s[5..].parse().ok()?, 1)
        }
        4 if all_digits(b) => NaiveDate::from_ymd_opt(s.parse().ok()?, 1, 1),
        _ => None,
    }
    .and_then(|d| d.and_hms_opt(0, 0, 0))
}

/// moment.utc(s) — forgiving ISO parse used for conference dates from yaml.
/// Empty or unparsable input gives None (an invalid moment).
pub fn parse_iso_loose(s: &str) -> Option<NaiveDateTime> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M"] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(dt);
        }
    }
    parse_bib_date(s)
}

fn month_from_name(s: &str) -> Option<u32> {
    const MONTHS: [&str; 12] = [
        "january", "february", "march", "april", "may", "june", "july", "august", "september",
        "october", "november", "december",
    ];
    let lower = s.to_lowercase();
    // moment's non-strict MMM accepts both abbreviated and full English names
    MONTHS
        .iter()
        .position(|m| lower == *m || (lower.len() >= 3 && m.starts_with(&lower)))
        .map(|i| i as u32 + 1)
}

/// moment.utc(`${year} ${mon}`, `YYYY ${monFmt}`) with
/// monFmt = parseInt(mon) ? 'MM' : 'MMM' — the year/month fallback path.
pub fn parse_year_month(year: &str, month: &str) -> Option<NaiveDateTime> {
    let y: i32 = year.trim().parse().ok()?;
    // parseInt semantics: leading digits; "01" → 1 (truthy → numeric month)
    let leading_digits: String =
        month.trim().chars().take_while(char::is_ascii_digit).collect();
    let m = match leading_digits.parse::<u32>() {
        Ok(n) if n != 0 => n,
        _ => month_from_name(month.trim())?,
    };
    NaiveDate::from_ymd_opt(y, m, 1)?.and_hms_opt(0, 0, 0)
}

/// moment#subtract(n, 'months') — calendar months with day-of-month clamping.
pub fn subtract_months(dt: NaiveDateTime, months: i64) -> NaiveDateTime {
    let total = dt.year() as i64 * 12 + dt.month0() as i64 - months;
    let (year, month0) = (total.div_euclid(12) as i32, total.rem_euclid(12) as u32);
    let day = dt.day();
    let date = (0..4)
        .filter_map(|back| NaiveDate::from_ymd_opt(year, month0 + 1, day - back.min(day - 1)))
        .next()
        .expect("clamped day is always valid");
    NaiveDateTime::new(date, dt.time())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDateTime {
        parse_bib_date(s).unwrap()
    }

    #[test]
    fn strict_formats() {
        assert_eq!(d("2022-05-04").to_string(), "2022-05-04 00:00:00");
        assert_eq!(d("2022-03").to_string(), "2022-03-01 00:00:00");
        assert_eq!(d("2022").to_string(), "2022-01-01 00:00:00");
        assert!(parse_bib_date("May the 4th").is_none());
        assert!(parse_bib_date("2022-3").is_none());
    }

    #[test]
    fn year_month() {
        assert_eq!(parse_year_month("2016", "March").unwrap().to_string(), "2016-03-01 00:00:00");
        assert_eq!(parse_year_month("2016", "01").unwrap().to_string(), "2016-01-01 00:00:00");
        assert_eq!(parse_year_month("2016", "12").unwrap().to_string(), "2016-12-01 00:00:00");
        assert!(parse_year_month("2016", "Notamonth").is_none());
    }

    #[test]
    fn month_subtraction_clamps() {
        let dt = d("2026-03-31");
        assert_eq!(subtract_months(dt, 1).to_string(), "2026-02-28 00:00:00");
        assert_eq!(subtract_months(dt, 3).to_string(), "2025-12-31 00:00:00");
        assert_eq!(subtract_months(dt, 0), dt);
    }
}
