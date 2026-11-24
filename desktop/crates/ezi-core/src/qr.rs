//! QR code of an item code: byte mode, error correction M, smallest version. The web app draws the same symbol
//! (`frontend/src/lib/qr.ts`); a test reads the web's matrices and scans them, so a label scans the same on both.

use qrcode::{Color, EcLevel, QrCode};

/// Empty modules around the symbol, the QR minimum.
pub const QUIET_MODULES: usize = 4;

/// The modules of one QR symbol, row by row.
pub struct Matrix {
    pub width: usize,
    dark: Vec<bool>,
}

impl Matrix {
    pub fn is_dark(&self, x: usize, y: usize) -> bool {
        self.dark[y * self.width + x]
    }
}

/// The symbol for `value`, or None when it is empty or blank.
pub fn matrix(value: &str) -> Option<Matrix> {
    if value.trim().is_empty() {
        return None;
    }
    let code = QrCode::with_error_correction_level(value.as_bytes(), EcLevel::M).ok()?;
    Some(Matrix { width: code.width(), dark: code.to_colors().into_iter().map(|c| c == Color::Dark).collect() })
}

/// The symbol as an 8-bit grayscale PNG, black on white, `scale` pixels per module, with the quiet zone.
pub fn png(value: &str, scale: u32) -> Option<Vec<u8>> {
    let m = matrix(value)?;
    let side = (m.width + 2 * QUIET_MODULES) as u32 * scale;
    let mut pixels = vec![255u8; (side * side) as usize];
    for y in 0..m.width {
        for x in 0..m.width {
            if m.is_dark(x, y) {
                for py in (y + QUIET_MODULES) as u32 * scale..(y + QUIET_MODULES + 1) as u32 * scale {
                    let start = (py * side) as usize + (x + QUIET_MODULES) * scale as usize;
                    pixels[start..start + scale as usize].fill(0);
                }
            }
        }
    }
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, side, side);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(&pixels).ok()?;
    Some(out)
}
