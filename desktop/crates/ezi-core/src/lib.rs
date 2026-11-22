//! EZI desktop client logic with no UI dependency. Everything here builds and is tested on any OS.

pub mod api;
pub mod code128;
pub mod files;
pub mod forms;
pub mod format;
pub mod photo;
pub mod i18n;
pub mod models;
pub mod nav;
pub mod settings;
pub mod theme;

/// Shown in the window title.
pub const APP_NAME: &str = "EZI";

/// The app version, taken from Cargo.toml (kept equal to the web app and installer version, 1.2.0 for this release).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Window title, for example "EZI 1.2.0".
pub fn window_title() -> String {
    format!("{APP_NAME} {}", version())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_has_name_and_version() {
        assert_eq!(window_title(), format!("EZI {}", env!("CARGO_PKG_VERSION")));
        assert!(window_title().starts_with("EZI 1."));
    }
}
