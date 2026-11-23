//! Numbers and dates the way the web app shows them (`frontend/src/lib/format.ts`): Indonesian locale, dd/MM/yyyy.

/// `1234567` becomes `1.234.567` (the id-ID grouping), negative numbers keep their sign.
pub fn format_number(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3 + 1);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}

/// `2026-10-23` becomes `23/10/2026`; a UTC timestamp (`2026-11-23T17:30:00.000Z`) becomes the Jakarta date of that moment, like
/// the web `formatDate`. Empty gives `-`; anything else is returned as it came.
pub fn format_date(value: &str) -> String {
    let b = value.as_bytes();
    if value.is_empty() {
        return "-".into();
    }
    if b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return format!("{}/{}/{}", &value[8..10], &value[5..7], &value[0..4]);
    }
    let with_time = format_date_time(value);
    // Only a real timestamp grew a time part; keep the date of it.
    if with_time.len() == 16 && with_time != value { with_time[..10].to_string() } else { value.to_string() }
}

// The web app shows every date in Asia/Jakarta, which is UTC+7 all year (no daylight saving), so a fixed offset is exact.
const JAKARTA_SECONDS: i64 = 7 * 3600;

/// (year, month, day) of a day count since 1970-01-01 (Howard Hinnant's civil-from-days).
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = y - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn date_of(unix_seconds: i64) -> String {
    let (y, m, d) = civil_from_days((unix_seconds + JAKARTA_SECONDS).div_euclid(86_400));
    format!("{y:04}-{m:02}-{d:02}")
}

fn now_seconds() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

/// Today as `YYYY-MM-DD` in Jakarta, like `today()` in the web app.
pub fn today() -> String {
    date_of(now_seconds())
}

/// The date `n` days from today (negative = past), like `daysFromToday` in the web app.
pub fn days_from_today(n: i64) -> String {
    date_of(now_seconds() + n * 86_400)
}

/// Days from `from` to `to` (both `YYYY-MM-DD`), like `dayDiff`; None when either is not a real date.
pub fn day_diff(from: &str, to: &str) -> Option<i64> {
    let (a, b) = (parse_date(from)?, parse_date(to)?);
    Some(days_from_civil(b.0, b.1, b.2) - days_from_civil(a.0, a.1, a.2))
}

fn parse_date(value: &str) -> Option<(i64, i64, i64)> {
    let b = value.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' || !b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return None;
    }
    let (y, m, d): (i64, i64, i64) = (value[0..4].parse().ok()?, value[5..7].parse().ok()?, value[8..10].parse().ok()?);
    // A real calendar date: going through the day count and back must give the same date.
    (m >= 1 && d >= 1 && civil_from_days(days_from_civil(y, m, d)) == (y, m, d)).then_some((y, m, d))
}

/// Whether `value` is a real `YYYY-MM-DD` date (the form's check before the server's).
pub fn is_date(value: &str) -> bool {
    parse_date(value).is_some()
}

/// An ISO timestamp (`2026-11-22T17:30:00.000Z`) as `dd/MM/yyyy HH:mm` in Jakarta, like `formatDateTime`.
/// Anything that is not a UTC timestamp is returned as it came.
pub fn format_date_time(value: &str) -> String {
    let b = value.as_bytes();
    let utc = b.len() >= 19 && b[10] == b'T' && value.ends_with('Z');
    let (Some((y, m, d)), true) = (value.get(0..10).and_then(parse_date), utc) else { return if value.is_empty() { "-".into() } else { value.to_string() } };
    let (Ok(h), Ok(min), Ok(s)) = (value[11..13].parse::<i64>(), value[14..16].parse::<i64>(), value[17..19].parse::<i64>()) else { return value.to_string() };
    let seconds = days_from_civil(y, m, d) * 86_400 + h * 3600 + min * 60 + s + JAKARTA_SECONDS;
    let (ly, lm, ld) = civil_from_days(seconds.div_euclid(86_400));
    let in_day = seconds.rem_euclid(86_400);
    format!("{ld:02}/{lm:02}/{ly:04} {:02}:{:02}", in_day / 3600, in_day % 3600 / 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_thousands_like_id_id() {
        for (n, want) in [(0, "0"), (7, "7"), (999, "999"), (1000, "1.000"), (12_345, "12.345"), (1_234_567, "1.234.567"), (-1500, "-1.500"), (100_000_000, "100.000.000")] {
            assert_eq!(format_number(n), want);
        }
    }

    #[test]
    fn jakarta_dates_and_timestamps() {
        assert_eq!(date_of(0), "1970-01-01");
        assert_eq!(date_of(1_700_000_000), "2023-11-15"); // 2023-11-14T22:13:20Z is already the 15th in Jakarta
        assert_eq!((date_of(1_764_000_000).as_str(), date_of(1_764_010_000).as_str()), ("2025-11-24", "2025-11-25")); // 16:00Z and 18:46Z: the second is past midnight in Jakarta
        assert_eq!(format_date_time("2026-11-22T17:30:00.000Z"), "23/11/2026 00:30");
        assert_eq!(format_date_time("2026-12-31T20:00:00.000Z"), "01/01/2027 03:00");
        assert_eq!((format_date_time(""), format_date_time("nope")), ("-".to_string(), "nope".to_string()));
        assert!(is_date("2026-02-28") && !is_date("2026-02-30") && !is_date("2026-13-01") && !is_date("26-1-1") && is_date("2028-02-29") && !is_date("2027-02-29"));
        assert_eq!((day_diff("2026-11-22", "2026-11-25"), day_diff("2026-12-30", "2027-01-02"), day_diff("x", "2026-01-01")), (Some(3), Some(3), None));
        assert!(is_date(&today()) && is_date(&days_from_today(7)));
        assert_eq!(day_diff(&today(), &days_from_today(7)), Some(7));
    }

    #[test]
    fn formats_dates_as_day_month_year() {
        assert_eq!(format_date("2026-10-23"), "23/10/2026");
        assert_eq!(format_date(""), "-");
        assert_eq!(format_date("not a date"), "not a date");
        assert_eq!((format_date("2026-11-23T10:58:14.128Z").as_str(), format_date("2026-11-23T20:00:00.000Z").as_str()), ("23/11/2026", "24/11/2026"), "a timestamp shows its Jakarta date");
    }
}
