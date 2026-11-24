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

/// Writes a downloaded file into the Downloads folder under its own name (never over an existing file) and says where it went.
pub fn save_to_downloads(file_name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let dir = downloads_dir().ok_or_else(|| "no Downloads folder".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique_path(&dir, file_name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Arguments for PowerShell to send a file to the printer through the Windows "Print" verb (the same as the right-click menu).
/// A single quote in the path is doubled so it stays inside the quoted string.
pub fn print_command_args(path: &Path) -> Vec<String> {
    let quoted = path.to_string_lossy().replace('\'', "''");
    ["-NoProfile", "-NonInteractive", "-Command"].iter().map(|a| a.to_string()).chain([format!("Start-Process -FilePath '{quoted}' -Verb Print")]).collect()
}

/// Starts printing `path` with the Windows "Print" verb, without a console window. Windows only: elsewhere it returns the error.
/// shortcut: the print dialog is Windows' own (Print Pictures), no printer choice or label size here; upgrade if labels need a fixed size.
pub fn print_image(path: &Path) -> Result<(), String> {
    let mut command = std::process::Command::new("powershell");
    command.args(print_command_args(path));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// `qr-<item name>.png`, with the characters Windows does not allow in a file name replaced by `-`.
/// The name of the item and not its code, so the file name never shows a code to Staff (same as the web app).
pub fn qr_png_name(item_name: &str) -> String {
    let clean: String = item_name.chars().map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '-' } else { c }).collect();
    let clean = clean.trim().trim_end_matches('.').trim();
    format!("qr-{}.png", if clean.is_empty() { "item" } else { clean })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn printing_runs_the_print_verb_on_the_file_and_keeps_an_apostrophe_in_the_path_inside_the_quotes() {
        let args = print_command_args(Path::new(r"C:\Users\O'Neil\AppData\Local\Temp\qr-A.png"));
        assert_eq!(&args[..3], ["-NoProfile", "-NonInteractive", "-Command"]);
        assert_eq!(args[3], r"Start-Process -FilePath 'C:\Users\O''Neil\AppData\Local\Temp\qr-A.png' -Verb Print");
    }

    #[test]
    fn the_qr_file_is_named_after_the_item() {
        assert_eq!(qr_png_name("Proyektor Uji"), "qr-Proyektor Uji.png");
        assert_eq!(qr_png_name(" A/B:C*D? "), "qr-A-B-C-D-.png");
        assert_eq!(qr_png_name("..."), "qr-item.png");
        assert_eq!(qr_png_name(""), "qr-item.png");
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
