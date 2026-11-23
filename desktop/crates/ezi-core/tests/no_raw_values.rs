//! The desktop UI code must take colours and sizes from `ezi_core::theme`, never write them in place.
//! `main.rs` (window size) and `gallery.rs` (a developer page with sample layouts) are the only files allowed free sizes.

use std::fs;
use std::path::Path;

fn source_files() -> Vec<(String, String)> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../ezi-app/src");
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display())) {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "rs") {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            out.push((name, fs::read_to_string(&path).unwrap()));
        }
    }
    assert!(out.iter().any(|(n, _)| n == "widgets.rs"), "ezi-app sources not found");
    out
}

fn code_lines(src: &str) -> impl Iterator<Item = (usize, &str)> {
    src.lines().enumerate().filter(|(_, l)| !l.trim_start().starts_with("//")).map(|(i, l)| (i + 1, l))
}

#[test]
fn no_hex_colours_in_the_ui_code() {
    let mut found = Vec::new();
    for (name, src) in source_files() {
        for (n, line) in code_lines(&src) {
            let has_hex_literal = line.contains("0x") && line.split("0x").skip(1).any(|r| r.chars().take(6).all(|c| c.is_ascii_hexdigit()));
            let has_hash_hex = line.split('#').skip(1).any(|r| r.len() >= 6 && r.chars().take(6).all(|c| c.is_ascii_hexdigit()));
            if has_hex_literal || has_hash_hex || line.contains("rgb(0x") || line.contains("rgba(") || line.contains("gpui_kit::hsla(") {
                found.push(format!("{name}:{n}: {}", line.trim()));
            }
        }
    }
    assert!(found.is_empty(), "colours must come from ezi_core::theme tokens: {found:#?}");
}

#[test]
fn no_raw_pixel_sizes_in_the_ui_code() {
    let mut found = Vec::new();
    for (name, src) in source_files() {
        if name == "main.rs" || name == "gallery.rs" {
            continue;
        }
        for (n, line) in code_lines(&src) {
            let raw = line.split("px(").skip(1).any(|r| r.chars().next().is_some_and(|c| c.is_ascii_digit()));
            if raw {
                found.push(format!("{name}:{n}: {}", line.trim()));
            }
        }
    }
    assert!(found.is_empty(), "sizes must be constants of ezi_core::theme: {found:#?}");
}

#[test]
fn no_raw_durations_or_curves_outside_the_motion_module() {
    // Durations and curves are tokens of `ezi_core::motion`; only `motion.rs` of the app turns them into animations.
    let mut found = Vec::new();
    for (name, src) in source_files() {
        if name == "motion.rs" {
            continue;
        }
        for (n, line) in code_lines(&src) {
            let raw = ["Duration::from_", "Duration::new(", "Animation::new(", "with_easing(", "cubic_bezier(", "ease_out_quint", "ease_in_out(", "bounce(", "pulsating_between(", "quadratic("];
            if raw.iter().any(|r| line.contains(r)) {
                found.push(format!("{name}:{n}: {}", line.trim()));
            }
        }
    }
    assert!(found.is_empty(), "use ezi_core::motion tokens and crate::motion::animation: {found:#?}");
}
