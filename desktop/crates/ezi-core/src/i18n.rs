//! Interface text in Indonesian and English. A field named `nav_group_inventory` is the web app's `t.nav.groupInventory`
//! with the same text in both languages; a test reads `frontend/src/lib/strings.ts` and `strings.id.ts` and fails when
//! a shared text differs. Fields starting with `ui_` exist only in the desktop client.
//! Both languages are written as full struct values below, so a missing translation does not compile.

use crate::api::Lang;

macro_rules! strings {
    ($($name:ident),* $(,)?) => {
        #[derive(Debug)]
        pub struct Strings { $(pub $name: &'static str,)* }
        impl Strings {
            /// Every (field name, text) pair, for tests.
            pub fn entries(&self) -> Vec<(&'static str, &'static str)> {
                vec![$((stringify!($name), self.$name)),*]
            }
        }
    };
}

strings! {
    app_name, app_product, app_tagline,
    nav_dashboard, nav_group_inventory, nav_items, nav_categories, nav_suppliers, nav_stock, nav_group_operations, nav_loans,
    nav_purchases, nav_expenses, nav_reports, nav_group_admin, nav_backup, nav_users, nav_activity, nav_profile, nav_open_menu, nav_main_nav,
    common_save, common_saving, common_cancel, common_close, common_confirm, common_back, common_edit, common_delete, common_view,
    common_search, common_clear, common_all, common_none, common_required, common_optional, common_actions, common_retry, common_loading,
    common_previous, common_next, common_status, common_total, common_no, common_you, common_rows_per_page,
    user_sign_out, user_theme, user_theme_light, user_theme_dark, user_theme_system, user_account_menu, user_language,
    states_empty_title, states_error_title, states_error_body, states_no_access_title, states_no_access_body, states_not_found_title,
    states_not_found_body,
    errors_network, errors_signed_out, errors_rate_limited,
    ui_language_id, ui_language_en,
}

pub const EN: Strings = Strings {
    app_name: "EZI", app_product: "Inventory", app_tagline: "Office inventory and loans",
    nav_dashboard: "Dashboard", nav_group_inventory: "Inventory", nav_items: "Items", nav_categories: "Categories", nav_suppliers: "Suppliers",
    nav_stock: "Stock transactions", nav_group_operations: "Operations", nav_loans: "Loans", nav_purchases: "Purchase requests",
    nav_expenses: "Expenses", nav_reports: "Reports", nav_group_admin: "Administration", nav_backup: "Backup", nav_users: "User management",
    nav_activity: "Activity log", nav_profile: "My profile", nav_open_menu: "Open menu", nav_main_nav: "Main navigation",
    common_save: "Save", common_saving: "Saving...", common_cancel: "Cancel", common_close: "Close", common_confirm: "Confirm", common_back: "Back",
    common_edit: "Edit", common_delete: "Delete", common_view: "View", common_search: "Search", common_clear: "Clear filters", common_all: "All",
    common_none: "None", common_required: "Required", common_optional: "Optional", common_actions: "Actions", common_retry: "Try again",
    common_loading: "Loading...", common_previous: "Previous", common_next: "Next", common_status: "Status", common_total: "Total", common_no: "No",
    common_you: "You", common_rows_per_page: "Rows per page",
    user_sign_out: "Sign out", user_theme: "Theme", user_theme_light: "Light", user_theme_dark: "Dark", user_theme_system: "System",
    user_account_menu: "Account menu", user_language: "Language",
    states_empty_title: "Nothing here yet", states_error_title: "Could not load this page",
    states_error_body: "Check that EZI is running on the host PC, then try again.",
    states_no_access_title: "You do not have access to this page", states_no_access_body: "Ask an Admin if you need access.",
    states_not_found_title: "Page not found", states_not_found_body: "The page you opened does not exist or the record was removed.",
    errors_network: "Cannot reach the EZI server. Check that the EZI host PC is on and this device is on the office network, then try again.",
    errors_signed_out: "Your session has ended. Please sign in again.", errors_rate_limited: "Too many attempts. Please wait 10 minutes and try again.",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
};

pub const ID: Strings = Strings {
    app_name: "EZI", app_product: "Inventaris", app_tagline: "Inventaris dan peminjaman barang kantor",
    nav_dashboard: "Beranda", nav_group_inventory: "Inventaris", nav_items: "Barang", nav_categories: "Area dan jenis", nav_suppliers: "Supplier",
    nav_stock: "Transaksi stok", nav_group_operations: "Operasional", nav_loans: "Peminjaman", nav_purchases: "Pengajuan beli",
    nav_expenses: "Pengeluaran", nav_reports: "Laporan", nav_group_admin: "Administrasi", nav_backup: "Cadangan data", nav_users: "Kelola pengguna",
    nav_activity: "Riwayat aktivitas", nav_profile: "Profil saya", nav_open_menu: "Buka menu", nav_main_nav: "Navigasi utama",
    common_save: "Simpan", common_saving: "Menyimpan...", common_cancel: "Tidak jadi", common_close: "Tutup", common_confirm: "Konfirmasi",
    common_back: "Kembali", common_edit: "Ubah", common_delete: "Hapus", common_view: "Lihat", common_search: "Cari", common_clear: "Hapus filter",
    common_all: "Semua", common_none: "Tidak ada", common_required: "Wajib", common_optional: "Tidak wajib", common_actions: "Aksi",
    common_retry: "Coba lagi", common_loading: "Memuat...", common_previous: "Sebelumnya", common_next: "Berikutnya", common_status: "Status",
    common_total: "Total", common_no: "Tidak", common_you: "Anda", common_rows_per_page: "Baris per halaman",
    user_sign_out: "Keluar", user_theme: "Tema", user_theme_light: "Terang", user_theme_dark: "Gelap", user_theme_system: "Ikuti perangkat",
    user_account_menu: "Menu akun", user_language: "Bahasa",
    states_empty_title: "Belum ada data", states_error_title: "Halaman gagal dimuat",
    states_error_body: "Pastikan EZI menyala di PC server, lalu coba lagi.",
    states_no_access_title: "Anda tidak punya akses ke halaman ini", states_no_access_body: "Tanyakan ke Admin kalau Anda butuh akses.",
    states_not_found_title: "Halaman tidak ditemukan", states_not_found_body: "Halaman yang Anda buka tidak ada, atau datanya sudah dihapus.",
    errors_network: "Server EZI tidak bisa dihubungi. Pastikan PC server EZI menyala dan perangkat ini terhubung ke jaringan kantor, lalu coba lagi.",
    errors_signed_out: "Sesi Anda sudah berakhir. Silakan masuk lagi.", errors_rate_limited: "Terlalu banyak percobaan. Tunggu 10 menit, lalu coba lagi.",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
};

pub fn strings(lang: Lang) -> &'static Strings {
    match lang {
        Lang::Id => &ID,
        Lang::En => &EN,
    }
}

/// "Showing 1-8 of 17" / "Menampilkan 1-8 dari 17"; "No results" / "Tidak ada hasil" when `total` is 0.
pub fn showing(lang: Lang, from: u32, to: u32, total: u32) -> String {
    match (lang, total) {
        (Lang::En, 0) => "No results".into(),
        (Lang::Id, 0) => "Tidak ada hasil".into(),
        (Lang::En, _) => format!("Showing {from}-{to} of {total}"),
        (Lang::Id, _) => format!("Menampilkan {from}-{to} dari {total}"),
    }
}

pub fn page(lang: Lang, n: u32) -> String {
    match lang {
        Lang::En => format!("Page {n}"),
        Lang::Id => format!("Halaman {n}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn every_text_is_filled_in_both_languages_and_the_two_differ_where_they_should() {
        let (en, id) = (EN.entries(), ID.entries());
        assert_eq!(en.len(), id.len());
        for ((name, e), (_, i)) in en.iter().zip(&id) {
            assert!(!e.trim().is_empty() && !i.trim().is_empty(), "{name} is empty");
        }
        // Spot check that Indonesian is really Indonesian, not a copy of English.
        assert_ne!(EN.nav_dashboard, ID.nav_dashboard);
        assert_ne!(EN.common_save, ID.common_save);
    }

    #[test]
    fn counts_read_naturally() {
        assert_eq!(showing(Lang::En, 1, 8, 17), "Showing 1-8 of 17");
        assert_eq!(showing(Lang::Id, 9, 16, 17), "Menampilkan 9-16 dari 17");
        assert_eq!(showing(Lang::Id, 0, 0, 0), "Tidak ada hasil");
        assert_eq!(page(Lang::En, 2), "Page 2");
        assert_eq!(page(Lang::Id, 2), "Halaman 2");
    }

    /// `section: { ... }` of the web strings file as key -> text, for the lines that are plain `key: "text",`.
    fn web_section(source: &str, section: &str) -> HashMap<String, String> {
        let start = source.find(&format!("\n  {section}: {{")).unwrap_or_else(|| panic!("section {section} not found"));
        let body = &source[start + 1..];
        let end = body.find("\n  },").expect("section end");
        let mut out = HashMap::new();
        for line in body[..end].lines().skip(1) {
            let line = line.trim();
            let Some((key, rest)) = line.split_once(": \"") else { continue };
            let Some(value) = rest.strip_suffix("\",") else { continue };
            if key.chars().all(|c| c.is_ascii_alphanumeric()) {
                out.insert(key.to_string(), value.replace("\\\"", "\""));
            }
        }
        out
    }

    fn snake(camel: &str) -> String {
        let mut s = String::new();
        for c in camel.chars() {
            if c.is_ascii_uppercase() {
                s.push('_');
                s.push(c.to_ascii_lowercase());
            } else {
                s.push(c);
            }
        }
        s
    }

    #[test]
    fn shared_texts_equal_the_web_apps_texts() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        let en_src = std::fs::read_to_string(format!("{dir}strings.ts")).unwrap();
        let id_src = std::fs::read_to_string(format!("{dir}strings.id.ts")).unwrap();
        let mut compared = 0;
        for (lang, src, ours) in [("en", &en_src, &EN), ("id", &id_src, &ID)] {
            for section in ["app", "nav", "common", "user", "states", "errors"] {
                let web: HashMap<String, String> = web_section(src, section).into_iter().map(|(k, v)| (format!("{section}_{}", snake(&k)), v)).collect();
                for (field, text) in ours.entries() {
                    if let Some(want) = web.get(field) {
                        assert_eq!(text, want, "{lang}: {field} differs from the web app");
                        compared += 1;
                    }
                }
            }
        }
        // Every non-`ui_` field must have been found in the web app: a typo in a name would otherwise skip the check.
        let shared_fields = EN.entries().into_iter().filter(|(n, _)| !n.starts_with("ui_")).count();
        assert_eq!(compared, shared_fields * 2, "some shared fields were not found in the web strings");
    }
}
