//! Where files go on this computer and how they are named.

use std::path::{Path, PathBuf};

/// The user's Downloads folder: `%USERPROFILE%\Downloads` on Windows, `~/Downloads` elsewhere. `env` is injected for tests.
pub fn downloads_dir_from(env: impl Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let set = |k: &str| env(k).filter(|v| !v.trim().is_empty());
    set("USERPROFILE").or_else(|| set("HOME")).map(|h| PathBuf::from(h).join("Downloads"))
}

pub fn downloads_dir() -> Option<PathBuf> {
    downloads_dir_from(|k| std::env::var(k).ok())
}

/// `dir/name`, or `dir/name-1.ext`, `dir/name-2.ext`... when that file exists already, so a download never overwrites one.
/// Only the last part of `name` is used: a name from a server cannot point outside `dir`.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let safe = Path::new(name).file_name().and_then(|n| n.to_str()).filter(|n| !n.is_empty() && *n != "." && *n != "..").unwrap_or("download");
    let first = dir.join(safe);
    if !first.exists() {
        return first;
    }
    let p = Path::new(safe);
    let (stem, ext) = (p.file_stem().and_then(|s| s.to_str()).unwrap_or(safe), p.extension().and_then(|e| e.to_str()));
    (1..)
        .map(|n| match ext {
            Some(e) => dir.join(format!("{stem}-{n}.{e}")),
            None => dir.join(format!("{stem}-{n}")),
        })
        .find(|c| !c.exists())
        .expect("an unused name exists")
}

/// `barcode-<item name>.png`, with the characters Windows does not allow in a file name replaced by `-`.
/// The name of the item and not its code, so the file name never shows a code to Staff (same as the web app).
pub fn barcode_png_name(item_name: &str) -> String {
    let clean: String = item_name.chars().map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '-' } else { c }).collect();
    let clean = clean.trim().trim_end_matches('.').trim();
    format!("barcode-{}.png", if clean.is_empty() { "item" } else { clean })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_barcode_file_is_named_after_the_item() {
        assert_eq!(barcode_png_name("Proyektor Uji"), "barcode-Proyektor Uji.png");
        assert_eq!(barcode_png_name(" A/B:C*D? "), "barcode-A-B-C-D-.png");
        assert_eq!(barcode_png_name("..."), "barcode-item.png");
        assert_eq!(barcode_png_name(""), "barcode-item.png");
    }

    #[test]
    fn finds_the_downloads_folder() {
        let env = |pairs: &'static [(&'static str, &'static str)]| move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| v.to_string());
        assert_eq!(downloads_dir_from(env(&[("USERPROFILE", "C:\\Users\\a"), ("HOME", "/h")])), Some(PathBuf::from("C:\\Users\\a").join("Downloads")));
        assert_eq!(downloads_dir_from(env(&[("HOME", "/h")])), Some(PathBuf::from("/h/Downloads")));
        assert_eq!(downloads_dir_from(env(&[])), None);
    }

    #[test]
    fn never_overwrites_and_never_leaves_the_folder() {
        let dir = std::env::temp_dir().join(format!("ezi-files-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let first = unique_path(&dir, "ezi-items.xlsx");
        assert_eq!(first, dir.join("ezi-items.xlsx"));
        std::fs::write(&first, b"a").unwrap();
        assert_eq!(unique_path(&dir, "ezi-items.xlsx"), dir.join("ezi-items-1.xlsx"));
        std::fs::write(dir.join("ezi-items-1.xlsx"), b"b").unwrap();
        assert_eq!(unique_path(&dir, "ezi-items.xlsx"), dir.join("ezi-items-2.xlsx"));
        assert_eq!(unique_path(&dir, "../../etc/passwd"), dir.join("passwd"));
        assert_eq!(unique_path(&dir, ".."), dir.join("download"));
        assert_eq!(unique_path(&dir, ""), dir.join("download"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
