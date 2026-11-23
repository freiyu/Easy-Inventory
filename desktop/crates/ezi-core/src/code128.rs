//! Code 128, code set B (ASCII 32-126): the same encoder as the web app (`frontend/src/lib/code128.ts`).
//! A test reads that file and fails if the pattern table here differs, so a label scans the same on both.
//! shortcut: set B only, no digit-pair compression (set C); upgrade if labels must be shorter.

/// Bar/space widths (in modules) of the 106 symbols and the stop symbol.
pub const PATTERNS: [&str; 107] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B: usize = 104;
const STOP: usize = 106;

/// Symbol values of `value` (start, data, checksum, stop), or None when it is empty or not printable ASCII.
pub fn symbols(value: &str) -> Option<Vec<usize>> {
    if value.is_empty() {
        return None;
    }
    let mut data = Vec::with_capacity(value.len());
    for ch in value.chars() {
        let n = ch as u32;
        if !(32..=126).contains(&n) {
            return None;
        }
        data.push((n - 32) as usize);
    }
    let sum = data.iter().enumerate().fold(START_B, |acc, (i, v)| acc + v * (i + 1));
    let mut out = Vec::with_capacity(data.len() + 3);
    out.push(START_B);
    out.extend(&data);
    out.push(sum % 103);
    out.push(STOP);
    Some(out)
}

/// Bar and space widths in modules, starting with a bar, or None when `value` cannot be encoded.
pub fn widths(value: &str) -> Option<Vec<u32>> {
    symbols(value).map(|s| s.iter().flat_map(|&i| PATTERNS[i].bytes().map(|b| u32::from(b - b'0'))).collect())
}

/// The bars as (start, width) in modules, quiet zone included on both sides; plus the total width in modules.
pub fn bars(value: &str, quiet: u32) -> Option<(Vec<(u32, u32)>, u32)> {
    let w = widths(value)?;
    let mut x = quiet;
    let mut out = Vec::new();
    for (i, width) in w.iter().enumerate() {
        if i % 2 == 0 {
            out.push((x, *width));
        }
        x += width;
    }
    Some((out, x + quiet))
}

/// The barcode as a PNG file: black bars on white, `scale` pixels per module, bars `height` pixels high,
/// a white margin on every side and the quiet zone left and right. No printed text (that would need a font).
/// Same look as the web app's download (`frontend/src/lib/barcode-png.ts`: 4 px per module, 120 px high, 16 px margin).
pub fn png(value: &str, scale: u32, height: u32, margin: u32) -> Option<Vec<u8>> {
    let (bars, total) = bars(value, 10)?;
    let width = total * scale;
    let mut row = vec![255u8; width as usize];
    for (start, w) in bars {
        row[(start * scale) as usize..((start + w) * scale) as usize].fill(0);
    }
    let blank = vec![255u8; width as usize];
    let mut pixels = Vec::with_capacity((width * (height + 2 * margin)) as usize);
    for y in 0..height + 2 * margin {
        pixels.extend_from_slice(if (margin..margin + height).contains(&y) { &row } else { &blank });
    }
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height + 2 * margin);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(&pixels).ok()?;
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_has_107_distinct_patterns_each_11_modules_wide_stop_13() {
        let mut seen = std::collections::HashSet::new();
        for (i, p) in PATTERNS.iter().enumerate() {
            assert!(seen.insert(*p));
            let sum: u32 = p.bytes().map(|b| u32::from(b - b'0')).sum();
            assert_eq!(sum, if i == 106 { 13 } else { 11 }, "symbol {i}");
        }
    }

    /// The same known values as the web app's test: A, AB and the Wikipedia PJJ123C example.
    #[test]
    fn known_values_equal_the_web_apps_tests() {
        assert_eq!(symbols("A"), Some(vec![104, 33, 34, 106]));
        assert_eq!(symbols("AB"), Some(vec![104, 33, 34, 102, 106]));
        assert_eq!(symbols("PJJ123C"), Some(vec![104, 48, 42, 42, 17, 18, 19, 35, 55, 106]));
        let item = symbols("AUL-ELK-0001").unwrap();
        assert_eq!((item.len(), item[0], *item.last().unwrap()), (15, 104, 106));
    }

    #[test]
    fn empty_and_non_ascii_are_refused() {
        assert_eq!(symbols(""), None);
        assert_eq!(symbols("é"), None);
        assert_eq!(symbols("a\tb"), None);
        assert_eq!(widths("A").unwrap().iter().sum::<u32>(), 11 * 3 + 13);
    }

    #[test]
    fn bars_start_after_the_quiet_zone_and_end_before_it() {
        let (bars, total) = bars("A", 10).unwrap();
        assert_eq!(bars[0].0, 10);
        assert_eq!(total, 10 + 11 * 3 + 13 + 10);
        let (start, width) = *bars.last().unwrap();
        assert!(start + width <= total - 10 && bars.iter().all(|(_, w)| (1..=4).contains(w)));
    }

    #[test]
    fn pattern_table_equals_the_web_apps_table() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/code128.ts");
        let ts = std::fs::read_to_string(path).unwrap();
        let mut web: Vec<String> = Vec::new();
        for part in ts.split('"').skip(1).step_by(2) {
            if (part.len() == 6 || part.len() == 7) && part.bytes().all(|b| b.is_ascii_digit()) {
                web.push(part.to_string());
            }
        }
        assert_eq!(web.len(), 107, "patterns found in code128.ts");
        assert_eq!(web, PATTERNS.map(String::from).to_vec());
    }
}
