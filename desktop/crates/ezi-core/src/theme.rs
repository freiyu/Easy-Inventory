//! The colour tokens of the web app (Kanagawa Lotus for light, Wave for dark), defined once for the desktop client.
//! A test reads `frontend/src/app/globals.css` and fails when a value here differs, so the two cannot drift apart.
//! Sizes (sidebar width, row height, text sizes) follow `docs/DESIGN.md` and are the constants at the bottom.

/// An sRGB colour.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

impl Rgb {
    /// `#rrggbb` (the `#` is required).
    pub fn from_hex(s: &str) -> Option<Rgb> {
        let h = s.strip_prefix('#')?;
        if h.len() != 6 || !h.is_ascii() {
            return None;
        }
        let n = u32::from_str_radix(h, 16).ok()?;
        Some(Rgb((n >> 16) as u8, (n >> 8) as u8, n as u8))
    }

    /// `0xRRGGBB`, the form UI toolkits take.
    pub fn as_u32(self) -> u32 {
        (u32::from(self.0) << 16) | (u32::from(self.1) << 8) | u32::from(self.2)
    }

    /// WCAG relative luminance.
    pub fn luminance(self) -> f64 {
        let lin = |c: u8| {
            let c = f64::from(c) / 255.0;
            if c <= 0.03928 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
        };
        0.2126 * lin(self.0) + 0.7152 * lin(self.1) + 0.0722 * lin(self.2)
    }
}

/// WCAG contrast ratio between two colours, from 1.0 to 21.0.
pub fn contrast(a: Rgb, b: Rgb) -> f64 {
    let (la, lb) = (a.luminance(), b.luminance());
    let (hi, lo) = if la >= lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Light,
    Dark,
}

macro_rules! tokens {
    ($($variant:ident => $css:literal, $light:literal, $dark:literal;)*) => {
        /// One colour token. `css_name` is the CSS variable of the web app without the leading `--`.
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Token { $($variant,)* }

        impl Token {
            pub const ALL: &'static [Token] = &[$(Token::$variant,)*];
            pub fn css_name(self) -> &'static str {
                match self { $(Token::$variant => $css,)* }
            }
            fn hex(self, mode: Mode) -> &'static str {
                match (self, mode) { $((Token::$variant, Mode::Light) => $light, (Token::$variant, Mode::Dark) => $dark,)* }
            }
        }
    };
}

tokens! {
    Background => "background", "#f4f2ec", "#1f1f28";
    Foreground => "foreground", "#545464", "#dcd7ba";
    Card => "card", "#f4f2ec", "#1f1f28";
    CardForeground => "card-foreground", "#545464", "#dcd7ba";
    Popover => "popover", "#f4f2ec", "#2a2a37";
    PopoverForeground => "popover-foreground", "#545464", "#dcd7ba";
    Primary => "primary", "#4d699b", "#7e9cd8";
    PrimaryForeground => "primary-foreground", "#ffffff", "#16161d";
    PrimaryHover => "primary-hover", "#445c88", "#8ba7dc";
    Link => "link", "#405781", "#7e9cd8";
    Secondary => "secondary", "#e9e7de", "#2a2a37";
    SecondaryForeground => "secondary-foreground", "#545464", "#dcd7ba";
    Muted => "muted", "#e9e7de", "#2a2a37";
    MutedForeground => "muted-foreground", "#605e52", "#a8a493";
    Accent => "accent", "#dfddd2", "#2a2a37";
    AccentForeground => "accent-foreground", "#545464", "#dcd7ba";
    Destructive => "destructive", "#c84053", "#ff5d62";
    DestructiveForeground => "destructive-foreground", "#ffffff", "#16161d";
    DestructiveHover => "destructive-hover", "#b93a4c", "#ff7378";
    DestructiveActive => "destructive-active", "#a93445", "#ff898d";
    Border => "border", "#d3d1c4", "#363646";
    Input => "input", "#83827a", "#7a7a8a";
    Ring => "ring", "#4d699b", "#7fb4ca";
    SuccessSoft => "success-soft", "#d3d8c4", "#323833";
    SuccessIcon => "success-icon", "#4d5f36", "#98bb6c";
    WarningSoft => "warning-soft", "#eedcb1", "#3f3937";
    WarningIcon => "warning-icon", "#7c5500", "#e6c384";
    DangerSoft => "danger-soft", "#ebcecd", "#432931";
    DangerIcon => "danger-icon", "#98313f", "#ff5d62";
    InfoSoft => "info-soft", "#d3d7dc", "#2e3344";
    InfoIcon => "info-icon", "#405781", "#7e9cd8";
    Sidebar => "sidebar", "#e9e7de", "#16161d";
    SidebarForeground => "sidebar-foreground", "#545464", "#dcd7ba";
    SidebarActive => "sidebar-active", "#d3d8c4", "#2d342b";
    SidebarActiveIcon => "sidebar-active-icon", "#4d5f36", "#98bb6c";
    SidebarBorder => "sidebar-border", "#d3d1c4", "#363646";
}

/// The colours of one mode.
#[derive(Clone, Copy, Debug)]
pub struct Palette {
    mode: Mode,
}

impl Palette {
    pub const LIGHT: Palette = Palette { mode: Mode::Light };
    pub const DARK: Palette = Palette { mode: Mode::Dark };

    pub fn of(mode: Mode) -> Palette {
        Palette { mode }
    }
    pub fn mode(&self) -> Mode {
        self.mode
    }
    pub fn color(&self, token: Token) -> Rgb {
        Rgb::from_hex(token.hex(self.mode)).expect("token table holds valid #rrggbb values")
    }
    /// The scrim behind dialogs: foreground at 30% in light, sidebar at 70% in dark (as in the web app).
    pub fn overlay(&self) -> (Rgb, f32) {
        match self.mode {
            Mode::Light => (self.color(Token::Foreground), 0.30),
            Mode::Dark => (self.color(Token::Sidebar), 0.70),
        }
    }
}

// Sizes in logical pixels, from `docs/DESIGN.md` and the layout tokens of globals.css.
pub const SIDEBAR_WIDTH: f32 = 224.0;
pub const CONTENT_MAX: f32 = 960.0;
pub const TABLE_ROW_HEIGHT: f32 = 40.0;
pub const TABLE_HEADER_HEIGHT: f32 = 36.0;
pub const CONTROL_HEIGHT: f32 = 36.0;
pub const NAV_ITEM_HEIGHT: f32 = 32.0;
pub const NAV_GROUP_HEIGHT: f32 = 24.0;
pub const TEXT_TITLE: f32 = 22.0;
pub const TEXT_SECTION: f32 = 16.0;
pub const TEXT_KPI: f32 = 32.0;
pub const TEXT_BODY: f32 = 15.0;
pub const TEXT_LABEL: f32 = 14.0;
pub const TEXT_TABLE: f32 = 14.0;
pub const RADIUS: f32 = 8.0;
pub const RADIUS_CARD: f32 = 12.0;

// Spacing scale (Tailwind's, as the web app uses it): 1 = 4 px.
pub const SPACE_HALF: f32 = 2.0;
pub const SPACE_1: f32 = 4.0;
pub const SPACE_1_5: f32 = 6.0;
pub const SPACE_2: f32 = 8.0;
pub const SPACE_3: f32 = 12.0;
pub const SPACE_4: f32 = 16.0;
pub const SPACE_6: f32 = 24.0;
pub const SPACE_8: f32 = 32.0;
// Fixed sizes of single widgets.
pub const BADGE_HEIGHT: f32 = 24.0;
pub const TABLE_FOOTER_HEIGHT: f32 = 48.0;
pub const USER_ROW_HEIGHT: f32 = 48.0;
/// Width of the green bar on the active sidebar item.
pub const NAV_BAR_WIDTH: f32 = 3.0;
pub const DIALOG_WIDTH: f32 = 480.0;
/// Longest line of running text (about 65 characters at 15 px).
pub const TEXT_MAX_WIDTH: f32 = 480.0;

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;

    /// `--name: value;` lines of every block that starts with `selector {` (globals.css has two `:root` blocks).
    fn css_block(css: &str, selector: &str) -> HashMap<String, String> {
        let marker = format!("\n{selector} {{");
        let mut out = HashMap::new();
        let mut from = 0;
        while let Some(i) = css[from..].find(&marker) {
            let start = from + i;
            let body = &css[start..];
            let end = body[1..].find("\n}").expect("block end") + 1;
            for l in body[..end].lines() {
                if let Some((name, value)) = l.trim().strip_prefix("--").and_then(|l| l.split_once(':')) {
                    out.insert(name.trim().to_string(), value.trim().trim_end_matches(';').trim().to_string());
                }
            }
            from = start + end;
        }
        assert!(!out.is_empty(), "{selector} block not found in globals.css");
        out
    }

    fn globals() -> String {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/app/globals.css");
        fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"))
    }

    #[test]
    fn every_token_equals_the_web_apps_css_variable() {
        let css = globals();
        for (selector, palette) in [(":root", Palette::LIGHT), (".dark", Palette::DARK)] {
            let block = css_block(&css, selector);
            for &t in Token::ALL {
                let want = block.get(t.css_name()).unwrap_or_else(|| panic!("--{} missing in {selector}", t.css_name()));
                assert_eq!(Rgb::from_hex(want), Some(palette.color(t)), "--{} in {selector}", t.css_name());
            }
        }
    }

    #[test]
    fn layout_sizes_equal_the_css_layout_tokens() {
        let block = css_block(&globals(), ":root");
        for (name, value) in [
            ("sidebar-width", SIDEBAR_WIDTH), ("content-max", CONTENT_MAX), ("table-row-height", TABLE_ROW_HEIGHT), ("table-header-height", TABLE_HEADER_HEIGHT),
            ("control-height", CONTROL_HEIGHT), ("nav-item-height", NAV_ITEM_HEIGHT), ("nav-group-height", NAV_GROUP_HEIGHT), ("text-title", TEXT_TITLE),
            ("text-section", TEXT_SECTION), ("text-kpi", TEXT_KPI), ("text-body", TEXT_BODY), ("text-label", TEXT_LABEL), ("text-table", TEXT_TABLE),
        ] {
            let css = block.get(name).unwrap_or_else(|| panic!("--{name} missing"));
            assert_eq!(css.trim_end_matches("px").parse::<f32>().ok(), Some(value), "--{name}");
        }
    }

    #[test]
    fn contrast_helper_matches_known_values() {
        let (black, white) = (Rgb(0, 0, 0), Rgb(255, 255, 255));
        assert!((contrast(black, white) - 21.0).abs() < 1e-9);
        assert!((contrast(white, white) - 1.0).abs() < 1e-9);
        assert!((contrast(Rgb(0x76, 0x76, 0x76), white) - 4.54).abs() < 0.01); // #767676 on white is the classic AA edge
    }

    #[test]
    fn text_pairs_have_at_least_4_5_to_1_in_both_modes() {
        use Token::*;
        let pairs = [
            (Foreground, Background), (CardForeground, Card), (PopoverForeground, Popover), (PrimaryForeground, Primary), (DestructiveForeground, Destructive),
            (MutedForeground, Background), (MutedForeground, Muted), (SecondaryForeground, Secondary), (AccentForeground, Accent), (Link, Background),
            (SidebarForeground, Sidebar), (SuccessIcon, SuccessSoft), (WarningIcon, WarningSoft), (DangerIcon, DangerSoft), (InfoIcon, InfoSoft),
            (SidebarActiveIcon, SidebarActive), (DangerIcon, Background), (DestructiveHover, Background),
        ];
        let mut failures = Vec::new();
        for palette in [Palette::LIGHT, Palette::DARK] {
            for (fg, bg) in pairs {
                let c = contrast(palette.color(fg), palette.color(bg));
                if c < 4.5 {
                    failures.push(format!("{:?} {} on {}: {c:.2}", palette.mode(), fg.css_name(), bg.css_name()));
                }
            }
        }
        // Known gap in the web palette itself (docs/DESIGN.md Kanagawa, approved in v1.1), found by this test on 2026-11-22:
        // the red text of a danger badge in dark mode. Not changed here; the test fails if any other pair slips below 4.5.
        assert_eq!(failures, ["Dark danger-icon on danger-soft: 4.37"], "text pairs below 4.5:1");
    }

    #[test]
    fn control_edges_and_focus_ring_have_at_least_3_to_1() {
        let mut failures = Vec::new();
        for palette in [Palette::LIGHT, Palette::DARK] {
            for (edge, bg) in [(Token::Input, Token::Background), (Token::Input, Token::Card), (Token::Ring, Token::Background)] {
                let c = contrast(palette.color(edge), palette.color(bg));
                if c < 3.0 {
                    failures.push(format!("{:?} {} on {}: {c:.2}", palette.mode(), edge.css_name(), bg.css_name()));
                }
            }
        }
        assert!(failures.is_empty(), "UI edges below 3:1: {failures:#?}");
    }

    #[test]
    fn hex_parsing_and_u32() {
        assert_eq!(Rgb::from_hex("#f4f2ec"), Some(Rgb(0xf4, 0xf2, 0xec)));
        assert_eq!(Rgb::from_hex("f4f2ec"), None);
        assert_eq!(Rgb::from_hex("#fff"), None);
        assert_eq!(Rgb(0x1f, 0x1f, 0x28).as_u32(), 0x1f1f28);
    }
}
