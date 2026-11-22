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

/// `2026-10-23` becomes `23/10/2026`. Anything else (empty, a timestamp) gives `-` or is returned as it came.
/// shortcut: plain dates only; the screens that show timestamps add time-zone handling (Asia/Jakarta, UTC+7) when they need it.
pub fn format_date(value: &str) -> String {
    let b = value.as_bytes();
    if value.is_empty() {
        return "-".into();
    }
    if b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return format!("{}/{}/{}", &value[8..10], &value[5..7], &value[0..4]);
    }
    value.to_string()
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
    fn formats_dates_as_day_month_year() {
        assert_eq!(format_date("2026-10-23"), "23/10/2026");
        assert_eq!(format_date(""), "-");
        assert_eq!(format_date("not a date"), "not a date");
    }
}
