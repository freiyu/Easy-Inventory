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
    auth_sign_in, auth_signing_in, auth_sign_in_title, auth_sign_in_intro, auth_setup_eyebrow, auth_setup_title, auth_setup_info, auth_setup_submit, auth_setup_done, auth_go_to_sign_in, auth_password_hint, auth_change_title, auth_change_forced_body, auth_change_submit, auth_change_done, auth_current_wrong, fields_email, fields_password, fields_current_password, fields_new_password, fields_confirm_password, fields_full_name, validation_email, validation_password_length, validation_password_match,
    dashboard_title, dashboard_admin_desc, dashboard_kpi_total, dashboard_kpi_total_caption, dashboard_kpi_stock, dashboard_kpi_stock_out, dashboard_kpi_stock_low, dashboard_kpi_approvals, dashboard_kpi_approvals_caption, dashboard_needs_attention, dashboard_view_all_items, dashboard_all_good, dashboard_col_item, dashboard_col_category, dashboard_col_stock, dashboard_col_minimum, dashboard_col_status, dashboard_my_active_loans, dashboard_my_loans_kpi, dashboard_available_kpi, dashboard_view_my_loans, dashboard_no_active_loans, dashboard_no_active_loans_body, dashboard_col_loan, dashboard_col_items, dashboard_col_due, status_stock_admin_safe, status_stock_admin_low, status_stock_admin_out, status_stock_staff_safe, status_stock_staff_low, status_stock_staff_out, status_loan_draft, status_loan_pending_approval, status_loan_approved, status_loan_rejected, status_loan_borrowed, status_loan_completed, status_loan_cancelled, status_loan_overdue,
    ui_language_id, ui_language_en, ui_server_address, ui_server_address_hint, ui_checking_server, ui_invalid_address, ui_timeout, ui_server_error, ui_setup_needed,
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
    dashboard_title: "Dashboard",
    dashboard_admin_desc: "Stock and loans at a glance.",
    dashboard_kpi_total: "Total unique items",
    dashboard_kpi_total_caption: "items registered",
    dashboard_kpi_stock: "Stock",
    dashboard_kpi_stock_out: "out of stock",
    dashboard_kpi_stock_low: "low",
    dashboard_kpi_approvals: "Waiting for approval",
    dashboard_kpi_approvals_caption: "Loan and purchase requests",
    dashboard_needs_attention: "Needs attention",
    dashboard_view_all_items: "View all items",
    dashboard_all_good: "All items are above their minimum stock.",
    dashboard_col_item: "Item",
    dashboard_col_category: "Category",
    dashboard_col_stock: "Stock",
    dashboard_col_minimum: "Minimum",
    dashboard_col_status: "Status",
    dashboard_my_active_loans: "My active loans",
    dashboard_my_loans_kpi: "My active loans",
    dashboard_available_kpi: "Items you can request",
    dashboard_view_my_loans: "View my loans",
    dashboard_no_active_loans: "You have no active loans",
    dashboard_no_active_loans_body: "When you request an item, it shows here until you return it.",
    dashboard_col_loan: "Loan",
    dashboard_col_items: "Items",
    dashboard_col_due: "Expected return",
    status_stock_admin_safe: "Safe",
    status_stock_admin_low: "Low",
    status_stock_admin_out: "Out",
    status_stock_staff_safe: "Available",
    status_stock_staff_low: "Low",
    status_stock_staff_out: "Out",
    status_loan_draft: "Draft",
    status_loan_pending_approval: "Pending Approval",
    status_loan_approved: "Approved",
    status_loan_rejected: "Rejected",
    status_loan_borrowed: "Borrowed",
    status_loan_completed: "Completed",
    status_loan_cancelled: "Cancelled",
    status_loan_overdue: "Overdue",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
    auth_sign_in: "Sign in",
    auth_signing_in: "Signing in...",
    auth_sign_in_title: "Sign in",
    auth_sign_in_intro: "Use your work email and password.",
    auth_setup_eyebrow: "First-run setup",
    auth_setup_title: "Create the first Admin account",
    auth_setup_info: "This account has full access. It is created only once. Later users are added in User management.",
    auth_setup_submit: "Create Admin account",
    auth_setup_done: "Admin account created. Sign in to continue.",
    auth_go_to_sign_in: "Go to sign in",
    auth_password_hint: "At least 8 characters.",
    auth_change_title: "Change your password",
    auth_change_forced_body: "You are using a temporary password. Choose a new one to continue.",
    auth_change_submit: "Change password",
    auth_change_done: "Password changed.",
    auth_current_wrong: "Enter your current password.",
    fields_email: "Email",
    fields_password: "Password",
    fields_current_password: "Current password",
    fields_new_password: "New password",
    fields_confirm_password: "Confirm password",
    fields_full_name: "Full name",
    validation_email: "Enter a valid email address.",
    validation_password_length: "Password must be at least 8 characters.",
    validation_password_match: "The passwords do not match.",
    ui_server_address: "Server address",
    ui_server_address_hint: "The address of the EZI host PC, for example 192.168.1.10:3000.",
    ui_checking_server: "Checking the server...",
    ui_invalid_address: "Enter the server address like 192.168.1.10:3000.",
    ui_timeout: "The server took too long to answer. Try again.",
    ui_server_error: "The request could not be completed. Try again. If it keeps happening, ask an Admin to check the application.",
    ui_setup_needed: "This server has no Admin account yet. Create the first one.",
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
    dashboard_title: "Beranda",
    dashboard_admin_desc: "Ringkasan stok dan peminjaman.",
    dashboard_kpi_total: "Total barang unik",
    dashboard_kpi_total_caption: "barang terdaftar",
    dashboard_kpi_stock: "Stok",
    dashboard_kpi_stock_out: "habis",
    dashboard_kpi_stock_low: "menipis",
    dashboard_kpi_approvals: "Menunggu persetujuan",
    dashboard_kpi_approvals_caption: "Pengajuan pinjam dan beli",
    dashboard_needs_attention: "Perlu dicek",
    dashboard_view_all_items: "Lihat semua barang",
    dashboard_all_good: "Semua barang masih di atas stok minimum.",
    dashboard_col_item: "Barang",
    dashboard_col_category: "Area",
    dashboard_col_stock: "Stok",
    dashboard_col_minimum: "Minimum",
    dashboard_col_status: "Status",
    dashboard_my_active_loans: "Peminjaman aktif saya",
    dashboard_my_loans_kpi: "Peminjaman aktif saya",
    dashboard_available_kpi: "Barang yang bisa dipinjam",
    dashboard_view_my_loans: "Lihat peminjaman saya",
    dashboard_no_active_loans: "Anda belum punya peminjaman aktif",
    dashboard_no_active_loans_body: "Saat Anda meminjam barang, peminjamannya muncul di sini sampai barangnya dikembalikan.",
    dashboard_col_loan: "Peminjaman",
    dashboard_col_items: "Barang",
    dashboard_col_due: "Rencana kembali",
    status_stock_admin_safe: "Aman",
    status_stock_admin_low: "Menipis",
    status_stock_admin_out: "Habis",
    status_stock_staff_safe: "Tersedia",
    status_stock_staff_low: "Menipis",
    status_stock_staff_out: "Habis",
    status_loan_draft: "Draf",
    status_loan_pending_approval: "Menunggu persetujuan",
    status_loan_approved: "Disetujui",
    status_loan_rejected: "Ditolak",
    status_loan_borrowed: "Sedang dipinjam",
    status_loan_completed: "Selesai",
    status_loan_cancelled: "Dibatalkan",
    status_loan_overdue: "Terlambat",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
    auth_sign_in: "Masuk",
    auth_signing_in: "Sedang masuk...",
    auth_sign_in_title: "Masuk",
    auth_sign_in_intro: "Pakai email dan password kantor Anda.",
    auth_setup_eyebrow: "Pengaturan awal",
    auth_setup_title: "Buat akun Admin pertama",
    auth_setup_info: "Akun ini punya akses penuh dan hanya dibuat sekali. Pengguna lain ditambahkan nanti di Kelola pengguna.",
    auth_setup_submit: "Buat akun Admin",
    auth_setup_done: "Akun Admin sudah dibuat. Silakan masuk.",
    auth_go_to_sign_in: "Ke halaman masuk",
    auth_password_hint: "Minimal 8 karakter.",
    auth_change_title: "Ganti password Anda",
    auth_change_forced_body: "Anda sedang memakai password sementara. Buat password baru untuk melanjutkan.",
    auth_change_submit: "Ganti password",
    auth_change_done: "Password sudah diganti.",
    auth_current_wrong: "Masukkan password Anda yang sekarang.",
    fields_email: "Email",
    fields_password: "Password",
    fields_current_password: "Password sekarang",
    fields_new_password: "Password baru",
    fields_confirm_password: "Ulangi password",
    fields_full_name: "Nama lengkap",
    validation_email: "Masukkan alamat email yang benar.",
    validation_password_length: "Password minimal 8 karakter.",
    validation_password_match: "Password tidak sama.",
    ui_server_address: "Alamat server",
    ui_server_address_hint: "Alamat PC induk EZI, misalnya 192.168.1.10:3000.",
    ui_checking_server: "Memeriksa server...",
    ui_invalid_address: "Isi alamat server seperti 192.168.1.10:3000.",
    ui_timeout: "Server terlalu lama menjawab. Coba lagi.",
    ui_server_error: "Permintaan gagal diproses. Coba lagi. Kalau masih terjadi, minta Admin mengecek aplikasi.",
    ui_setup_needed: "Server ini belum punya akun Admin. Buat yang pertama.",
};

pub fn strings(lang: Lang) -> &'static Strings {
    match lang {
        Lang::Id => &ID,
        Lang::En => &EN,
    }
}

/// "{label} is required." / "{label} wajib diisi." (the web app's `validation.required`).
pub fn required(lang: Lang, label: &str) -> String {
    match lang {
        Lang::En => format!("{label} is required."),
        Lang::Id => format!("{label} wajib diisi."),
    }
}

/// The text to show a person for an API error: the server's own message when it sent one, else a message for the kind of failure.
pub fn error_message(lang: Lang, error: &crate::api::ApiError) -> String {
    use crate::api::ApiError::*;
    let s = strings(lang);
    match error {
        Server { message, .. } => message.clone(),
        Network(_) => s.errors_network.to_string(),
        Timeout => s.ui_timeout.to_string(),
        InvalidUrl(_) => s.ui_invalid_address.to_string(),
        BadResponse { .. } => s.ui_server_error.to_string(),
    }
}


// Texts with a number or a name inside, the same wording as the web app's functions in `strings.ts`.

pub fn staff_desc(lang: Lang, first_name: &str) -> String {
    match lang {
        Lang::En => format!("Welcome back, {first_name}. Here are your loans and the items you can request."),
        Lang::Id => format!("Halo, {first_name}. Ini peminjaman Anda dan barang yang bisa Anda pinjam."),
    }
}

pub fn my_loans_caption(lang: Lang, overdue: i64) -> String {
    match (lang, overdue) {
        (Lang::En, 0) => "None overdue".into(),
        (Lang::Id, 0) => "Tidak ada yang terlambat".into(),
        (Lang::En, n) => format!("{n} overdue"),
        (Lang::Id, n) => format!("{n} terlambat"),
    }
}

pub fn available_caption(lang: Lang, active_items: i64) -> String {
    match lang {
        Lang::En => format!("Out of {active_items} active items"),
        Lang::Id => format!("Dari {active_items} barang aktif"),
    }
}

/// `due` is the date as shown (dd/MM/yyyy).
pub fn overdue_alert(lang: Lang, number: &str, items: &str, due: &str, days: i64) -> String {
    match lang {
        Lang::En => format!("Loan {number} ({items}) was due on {due} and is {days} {} overdue. Please return it to an Admin.", if days == 1 { "day" } else { "days" }),
        Lang::Id => format!("Peminjaman {number} ({items}) seharusnya kembali tanggal {due} dan sudah terlambat {days} hari. Tolong kembalikan ke Admin."),
    }
}

/// Admin sees Safe/Low/Out, Staff see Available/Low/Out (intentional, as in the web app).
pub fn stock_label(lang: Lang, admin: bool, status: crate::models::StockStatus) -> &'static str {
    use crate::models::StockStatus::*;
    let s = strings(lang);
    match (admin, status) {
        (true, Safe) => s.status_stock_admin_safe,
        (true, Low) => s.status_stock_admin_low,
        (true, Out) => s.status_stock_admin_out,
        (false, Safe) => s.status_stock_staff_safe,
        (false, Low) => s.status_stock_staff_low,
        (false, Out) => s.status_stock_staff_out,
    }
}

pub fn loan_status_label(lang: Lang, status: crate::models::LoanStatus) -> &'static str {
    use crate::models::LoanStatus::*;
    let s = strings(lang);
    match status {
        Draft => s.status_loan_draft,
        PendingApproval => s.status_loan_pending_approval,
        Approved => s.status_loan_approved,
        Rejected => s.status_loan_rejected,
        Borrowed => s.status_loan_borrowed,
        Completed => s.status_loan_completed,
        Cancelled => s.status_loan_cancelled,
        Overdue => s.status_loan_overdue,
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
    fn required_and_error_messages_read_naturally() {
        use crate::api::{ApiError, ErrorCode};
        assert_eq!(required(Lang::En, "Email"), "Email is required.");
        assert_eq!(required(Lang::Id, "Email"), "Email wajib diisi.");
        let server = ApiError::Server { status: 401, code: ErrorCode::Unauthenticated, message: "Salah.".into(), fields: Default::default() };
        assert_eq!(error_message(Lang::Id, &server), "Salah.");
        assert_eq!(error_message(Lang::En, &ApiError::Timeout), EN.ui_timeout);
        assert_eq!(error_message(Lang::Id, &ApiError::Network("x".into())), ID.errors_network);
        assert_eq!(error_message(Lang::En, &ApiError::InvalidUrl("x".into())), EN.ui_invalid_address);
        assert_eq!(error_message(Lang::En, &ApiError::BadResponse { status: 502, detail: String::new() }), EN.ui_server_error);
    }


    #[test]
    fn texts_with_numbers_read_like_the_web_app() {
        assert_eq!(staff_desc(Lang::En, "Staf"), "Welcome back, Staf. Here are your loans and the items you can request.");
        assert_eq!(staff_desc(Lang::Id, "Staf"), "Halo, Staf. Ini peminjaman Anda dan barang yang bisa Anda pinjam.");
        assert_eq!((my_loans_caption(Lang::En, 0).as_str(), my_loans_caption(Lang::En, 2).as_str()), ("None overdue", "2 overdue"));
        assert_eq!((my_loans_caption(Lang::Id, 0).as_str(), my_loans_caption(Lang::Id, 2).as_str()), ("Tidak ada yang terlambat", "2 terlambat"));
        assert_eq!(available_caption(Lang::En, 6), "Out of 6 active items");
        assert_eq!(available_caption(Lang::Id, 6), "Dari 6 barang aktif");
        assert_eq!(overdue_alert(Lang::En, "LN-2", "Kabel x2", "01/11/2026", 21), "Loan LN-2 (Kabel x2) was due on 01/11/2026 and is 21 days overdue. Please return it to an Admin.");
        assert_eq!(overdue_alert(Lang::En, "LN-2", "Kabel x2", "01/11/2026", 1), "Loan LN-2 (Kabel x2) was due on 01/11/2026 and is 1 day overdue. Please return it to an Admin.");
        assert_eq!(overdue_alert(Lang::Id, "LN-2", "Kabel x2", "01/11/2026", 21), "Peminjaman LN-2 (Kabel x2) seharusnya kembali tanggal 01/11/2026 dan sudah terlambat 21 hari. Tolong kembalikan ke Admin.");
    }

    /// `name: { Key: "text", "Other Key": "text", ... }` of the web `status` section as key -> text.
    fn web_nested(source: &str, name: &str) -> HashMap<String, String> {
        let start = source.find(&format!("    {name}: {{")).unwrap_or_else(|| panic!("{name} not found"));
        let body = &source[start + name.len() + 7..];
        let end = body.find('}').unwrap();
        body[..end]
            .split(',')
            .filter_map(|part| {
                let (k, v) = part.split_once(": \"")?;
                Some((k.trim().trim_matches('"').to_string(), v.trim().trim_end_matches('"').to_string()))
            })
            .collect()
    }

    #[test]
    fn status_labels_equal_the_web_apps_labels() {
        use crate::models::{LoanStatus::*, StockStatus::*};
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        for (lang, file) in [(Lang::En, "strings.ts"), (Lang::Id, "strings.id.ts")] {
            let src = std::fs::read_to_string(format!("{dir}{file}")).unwrap();
            let (admin, staff, loan) = (web_nested(&src, "stockAdmin"), web_nested(&src, "stockStaff"), web_nested(&src, "loan"));
            for (status, key) in [(Safe, "Safe"), (Low, "Low"), (Out, "Out")] {
                assert_eq!(stock_label(lang, true, status), admin[key], "{file} admin {key}");
                assert_eq!(stock_label(lang, false, status), staff[key], "{file} staff {key}");
            }
            for (status, key) in [(Draft, "Draft"), (PendingApproval, "Pending Approval"), (Approved, "Approved"), (Rejected, "Rejected"), (Borrowed, "Borrowed"), (Completed, "Completed"), (Cancelled, "Cancelled"), (Overdue, "Overdue")] {
                assert_eq!(loan_status_label(lang, status), loan[key], "{file} loan {key}");
            }
        }
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
            for section in ["app", "nav", "common", "user", "states", "errors", "auth", "fields", "validation", "dashboard"] {
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
        let shared_fields = EN.entries().into_iter().filter(|(n, _)| !n.starts_with("ui_") && !n.starts_with("status_")).count();
        assert_eq!(compared, shared_fields * 2, "some shared fields were not found in the web strings");
    }
}
