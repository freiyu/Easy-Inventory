//! What the desktop client remembers between runs: the server address and the language. Nothing else.
//! It is never a password, a session cookie or any office data. The file lives in the user's profile folder.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct Settings {
    /// As typed and normalized, for example `http://192.168.1.10:3000`.
    #[serde(default)]
    pub server_url: Option<String>,
    /// `id` or `en`.
    #[serde(default)]
    pub lang: Option<String>,
}

/// The profile folder for EZI settings: `%APPDATA%\EZI` on Windows, `$XDG_CONFIG_HOME/ezi` or `~/.config/ezi` elsewhere.
/// `env` is injected so the rule can be tested without touching the real environment.
pub fn config_dir_from(env: impl Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let set = |k: &str| env(k).filter(|v| !v.trim().is_empty());
    if let Some(appdata) = set("APPDATA") {
        return Some(PathBuf::from(appdata).join("EZI"));
    }
    if let Some(xdg) = set("XDG_CONFIG_HOME") {
        return Some(PathBuf::from(xdg).join("ezi"));
    }
    set("HOME").map(|h| PathBuf::from(h).join(".config").join("ezi"))
}

pub fn default_path() -> Option<PathBuf> {
    config_dir_from(|k| std::env::var(k).ok()).map(|d| d.join("desktop.json"))
}

/// A missing or damaged file gives the defaults: losing a remembered address must never stop the app from starting.
pub fn load(path: &Path) -> Settings {
    fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Writes through a temporary file so a crash cannot leave half a file.
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(settings).map_err(io::Error::other)?)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ezi-core-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn picks_the_profile_folder() {
        let env = |pairs: &'static [(&'static str, &'static str)]| move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| v.to_string());
        assert_eq!(config_dir_from(env(&[("APPDATA", "C:\\Users\\a\\AppData\\Roaming")])), Some(PathBuf::from("C:\\Users\\a\\AppData\\Roaming").join("EZI")));
        assert_eq!(config_dir_from(env(&[("XDG_CONFIG_HOME", "/x"), ("HOME", "/h")])), Some(PathBuf::from("/x/ezi")));
        assert_eq!(config_dir_from(env(&[("HOME", "/h")])), Some(PathBuf::from("/h/.config/ezi")));
        assert_eq!(config_dir_from(env(&[("APPDATA", "  ")])), None);
    }

    #[test]
    fn saves_and_loads_and_survives_damage() {
        let dir = temp("settings");
        let path = dir.join("nested").join("desktop.json");
        assert_eq!(load(&path), Settings::default()); // missing file
        let s = Settings { server_url: Some("http://192.168.1.10:3000".into()), lang: Some("id".into()) };
        save(&path, &s).unwrap();
        assert_eq!(load(&path), s);
        fs::write(&path, b"{ not json").unwrap();
        assert_eq!(load(&path), Settings::default()); // damaged file
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_file_holds_only_the_address_and_language() {
        let dir = temp("fields");
        let path = dir.join("desktop.json");
        save(&path, &Settings { server_url: Some("http://s:1".into()), lang: None }).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        for forbidden in ["password", "cookie", "session", "token"] {
            assert!(!text.to_lowercase().contains(forbidden), "{forbidden} must never be stored");
        }
        fs::remove_dir_all(&dir).unwrap();
    }
}
