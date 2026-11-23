//! The pictures the app draws: the EZI mark (the owner's logo, the same path as `frontend/src/components/shared/logo.tsx`) and
//! the Lucide icons of the sidebar (the same icons as `frontend/src/lib/nav.ts`). They are compiled into the program, so nothing
//! is fetched and the app works offline. Everything else falls back to the component library's own icons.

use std::borrow::Cow;

use gpui_kit::*;

gpui_kit::assets::icon_assets!(
    ExtraIcons,
    [LayoutDashboard, Package, Tags, Truck, ArrowLeftRight, HandHelping, ShoppingCart, Wallet, FileChartColumn, DatabaseBackup, Users, ScrollText, UserRound, ChevronsUpDown]
);

/// The path the logo is loaded from (a single-colour shape: the colour is set by the text colour of the element that draws it).
pub const MARK: &str = "ezi/mark.svg";
const MARK_SVG: &[u8] = include_bytes!("../assets/ezi-mark.svg");

pub struct EziAssets;

impl AssetSource for EziAssets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        if path == MARK {
            return Ok(Some(Cow::Borrowed(MARK_SVG)));
        }
        if let Some(bytes) = ExtraIcons.load(path)? {
            return Ok(Some(bytes));
        }
        gpui_kit::assets::Assets.load(path)
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let mut paths = gpui_kit::assets::Assets.list(path)?;
        paths.extend(ExtraIcons.list(path)?);
        paths.sort();
        paths.dedup();
        Ok(paths)
    }
}

/// The asset path of the Lucide icon a page uses (`Page::icon` gives the web's name for it).
pub fn page_icon(name: &str) -> SharedString {
    use gpui_kit::assets::IconName as I;
    match name {
        "LayoutDashboard" => I::LayoutDashboard,
        "Package" => I::Package,
        "Tags" => I::Tags,
        "Truck" => I::Truck,
        "ArrowLeftRight" => I::ArrowLeftRight,
        "HandHelping" => I::HandHelping,
        "ShoppingCart" => I::ShoppingCart,
        "Wallet" => I::Wallet,
        "FileBarChart" => I::FileChartColumn,
        "DatabaseBackup" => I::DatabaseBackup,
        "Users" => I::Users,
        "ScrollText" => I::ScrollText,
        _ => I::UserRound,
    }
    .path()
}

/// The up-down chevrons at the right of the user row.
pub fn chevrons() -> SharedString {
    gpui_kit::assets::IconName::ChevronsUpDown.path()
}
