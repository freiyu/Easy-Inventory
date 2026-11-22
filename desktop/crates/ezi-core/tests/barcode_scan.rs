//! What the encoder draws must scan: the bars are painted into a grey image and read back by an independent decoder.

use ezi_core::code128;
use rxing::{helpers::detect_in_luma, BarcodeFormat};

/// Draws the bars of `value` at `scale` pixels per module, 60 pixels high, black on white.
fn render(value: &str, scale: u32) -> (Vec<u8>, u32, u32) {
    let (bars, total) = code128::bars(value, 10).expect("encodable");
    let (width, height) = (total * scale, 60);
    let mut luma = vec![255u8; (width * height) as usize];
    for (start, w) in bars {
        for x in (start * scale)..((start + w) * scale) {
            for y in 0..height {
                luma[(y * width + x) as usize] = 0;
            }
        }
    }
    (luma, width, height)
}

fn read(value: &str, scale: u32) -> Option<String> {
    let (luma, w, h) = render(value, scale);
    detect_in_luma(luma, w, h, Some(BarcodeFormat::CODE_128)).ok().map(|r| r.getText().to_string())
}

#[test]
fn item_codes_scan_back_to_the_same_text() {
    for code in ["KTR-ELK-0001", "AUL-ELK-0001", "OFF-FUR-12345", "A", "AB", "PJJ123C", "abc xyz 09 ~", "KTR-0001"] {
        assert_eq!(read(code, 3).as_deref(), Some(code), "{code}");
    }
}

#[test]
fn a_wrong_checksum_does_not_scan() {
    // Flip the checksum symbol of a valid label: a good decoder refuses it, which proves the checksum is being checked.
    let (bars, total) = code128::bars("KTR-ELK-0001", 10).unwrap();
    let mut symbols = code128::symbols("KTR-ELK-0001").unwrap();
    let n = symbols.len();
    symbols[n - 2] = (symbols[n - 2] + 1) % 103;
    let widths: Vec<u32> = symbols.iter().flat_map(|&i| code128::PATTERNS[i].bytes().map(|b| u32::from(b - b'0'))).collect();
    let scale = 3u32;
    let (width, height) = (total * scale, 60u32);
    let mut luma = vec![255u8; (width * height) as usize];
    let mut x = 10;
    for (i, w) in widths.iter().enumerate() {
        if i % 2 == 0 {
            for px in (x * scale)..((x + w) * scale) {
                for y in 0..height {
                    luma[(y * width + px) as usize] = 0;
                }
            }
        }
        x += w;
    }
    let _ = bars;
    assert!(detect_in_luma(luma, width, height, Some(BarcodeFormat::CODE_128)).is_err());
}
