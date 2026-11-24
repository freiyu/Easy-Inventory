//! What the encoder draws must scan: the modules are painted into a grey image and read back by an independent decoder.
//! The matrices the web app produces (`frontend/src/lib/qr-golden.json`) are read the same way, which proves the web labels scan.

use ezi_core::qr;
use rxing::{helpers::detect_in_luma, BarcodeFormat};

const CODES: [&str; 6] = ["KTR-ELK-0001", "AUL-ELK-0001", "OFF-FUR-12345", "A", "abc xyz 09 ~", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"];

/// Paints `rows` (true = dark) at `scale` pixels per module with a 4-module quiet zone, and reads them back.
fn read(rows: &[Vec<bool>], scale: usize) -> Option<String> {
    let side = (rows.len() + 8) * scale;
    let mut luma = vec![255u8; side * side];
    for (y, row) in rows.iter().enumerate() {
        for (x, &dark) in row.iter().enumerate() {
            if dark {
                for py in (y + 4) * scale..(y + 5) * scale {
                    luma[py * side + (x + 4) * scale..py * side + (x + 5) * scale].fill(0);
                }
            }
        }
    }
    detect_in_luma(luma, side as u32, side as u32, Some(BarcodeFormat::QR_CODE)).ok().map(|r| r.getText().to_string())
}

fn rows_of(code: &str) -> Vec<Vec<bool>> {
    let m = qr::matrix(code).expect("encodable");
    (0..m.width).map(|y| (0..m.width).map(|x| m.is_dark(x, y)).collect()).collect()
}

#[test]
fn item_codes_scan_back_to_the_same_text() {
    for code in CODES {
        assert_eq!(read(&rows_of(code), 6).as_deref(), Some(code), "{code}");
    }
}

#[test]
fn nothing_to_encode_gives_nothing() {
    assert!(qr::matrix("").is_none());
    assert!(qr::matrix("   ").is_none());
    assert!(qr::png("", 8).is_none());
    assert!(qr::png("  ", 8).is_none());
}

#[test]
fn the_png_file_scans_back_to_the_same_text_and_is_a_valid_png() {
    for code in ["KTR-ELK-0001", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"] {
        let bytes = qr::png(code, 8).expect("encodable");
        assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
        let mut reader = png::Decoder::new(std::io::Cursor::new(&bytes)).read_info().unwrap();
        let mut luma = vec![0u8; reader.output_buffer_size()];
        let info = reader.next_frame(&mut luma).unwrap();
        assert_eq!((info.color_type, info.bit_depth), (png::ColorType::Grayscale, png::BitDepth::Eight));
        let width = qr::matrix(code).unwrap().width as u32;
        assert_eq!((info.width, info.height), ((width + 8) * 8, (width + 8) * 8), "modules plus the quiet zone");
        let text = detect_in_luma(luma, info.width, info.height, Some(BarcodeFormat::QR_CODE)).map(|r| r.getText().to_string()).ok();
        assert_eq!(text.as_deref(), Some(code));
    }
}

#[test]
fn the_web_golden_matrices_scan() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/qr-golden.json");
    let golden: std::collections::BTreeMap<String, Vec<String>> = serde_json::from_str(&std::fs::read_to_string(path).expect("golden file")).unwrap();
    assert!(golden.len() >= CODES.len());
    for (code, lines) in golden {
        let rows: Vec<Vec<bool>> = lines.iter().map(|l| l.chars().map(|c| c == '1').collect()).collect();
        assert_eq!(read(&rows, 6).as_deref(), Some(code.as_str()), "web QR for {code}");
    }
}
