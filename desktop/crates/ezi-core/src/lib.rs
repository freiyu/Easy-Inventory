//! EZI desktop client logic with no UI dependency. Everything here builds and is tested on any OS.

pub mod api;
pub mod qr;
pub mod files;
pub mod forms;
pub mod format;
pub mod photo;
pub mod i18n;
pub mod models;
pub mod motion;
pub mod nav;
pub mod settings;
pub mod theme;

/// Shown in the window title.
pub const APP_NAME: &str = "EZI";

/// The version as one contiguous text inside the binary: `installer/stage.sh` greps `ezi.exe` for it, so a stale exe is not packed.
pub const VERSION_MARKER: &str = concat!("ezi-version:", env!("CARGO_PKG_VERSION"));

/// The app version, taken from Cargo.toml (kept equal to the web app and installer version, 1.2.1 for this release).
/// It is read from `VERSION_MARKER`, so the marker stays in the binary.
pub fn version() -> &'static str {
    &VERSION_MARKER["ezi-version:".len()..]
}

/// Window title, for example "EZI 1.2.1".
pub fn window_title() -> String {
    format!("{APP_NAME} {}", version())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_version_marker_is_one_contiguous_text_that_installer_stage_sh_looks_for() {
        assert_eq!(VERSION_MARKER, format!("ezi-version:{}", env!("CARGO_PKG_VERSION")));
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn title_has_name_and_version() {
        assert_eq!(window_title(), format!("EZI {}", env!("CARGO_PKG_VERSION")));
        assert!(window_title().starts_with("EZI 1."));
    }
}
