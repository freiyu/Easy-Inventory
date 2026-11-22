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
    items_title, items_desc_admin, items_desc_staff, items_search_placeholder, items_all_categories, items_all_subcategories, items_stock_status_filter, items_availability_filter, items_all_stock_status, items_all_availability, items_col_name, items_col_category, items_col_subcategory, items_col_stock, items_col_minimum, items_col_unit, items_col_availability, items_inactive_tag, items_empty_title, items_empty_filtered, items_empty_filtered_body, items_record_status_filter, items_active_only, items_inactive_only, items_all_records, items_details_card, items_stock_card, items_current_stock, items_minimum_stock, items_reserved, items_available_for_loan, items_last_price, items_movements, items_movements_empty, items_col_date, items_col_type, items_col_change, items_col_balance, items_col_ref, items_col_user, items_created_at, items_updated_at, items_staff_stock_note, items_barcode_card, items_photo_none, items_not_found_back, fields_category, fields_subcategory, fields_unit, fields_preferred_supplier, fields_location, common_notes, status_tx_type_in, status_tx_type_out, status_tx_type_adjustment, status_tx_type_loan_issue, status_tx_type_loan_return, status_tx_type_reversal,
    items_add, items_edit, items_deactivate, items_activate, items_delete, items_add_title, items_edit_title, items_section_basic, items_section_stock, items_section_purchasing, items_field_code, items_field_name, items_code_hint, items_code_auto, items_opening_hint, items_opening_read_only, items_minimum_hint, items_no_supplier, items_save_item, items_saved_add, items_saved_edit, items_deactivate_body, items_activate_body, items_delete_body, items_deactivated, items_activated, items_deleted, items_field_photo, items_photo_hint, items_photo_remove, items_photo_selected, items_photo_save_failed, item_import_button, item_import_title, item_import_desc, item_import_file_label, item_import_reading, item_import_preview_title, item_import_col_line, item_import_col_result, item_import_status_ready, item_import_status_skipped, item_import_status_error, item_import_status_imported, item_import_another, item_import_backup_note, item_import_confirming, item_import_back_to_items, fields_name, fields_opening_stock, fields_minimum_stock, fields_last_price, fields_supplier, validation_select_category, validation_select_subcategory, validation_select_unit, validation_select_supplier, errors_photo_empty, errors_photo_type, errors_photo_too_big,
    common_export_excel, common_exporting,
    ui_language_id, ui_language_en, ui_browse, ui_check_file, ui_file_path, ui_file_unreadable, ui_export_saved_to, ui_server_address, ui_server_address_hint, ui_checking_server, ui_invalid_address, ui_timeout, ui_server_error, ui_setup_needed,
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
    items_title: "Items",
    items_desc_admin: "Search, filter, and manage inventory items.",
    items_desc_staff: "Check what is available before you request a loan.",
    items_search_placeholder: "Search by name or code",
    items_all_categories: "All categories",
    items_all_subcategories: "All subcategories",
    items_stock_status_filter: "Stock status",
    items_availability_filter: "Availability",
    items_all_stock_status: "All stock statuses",
    items_all_availability: "All availability",
    items_col_name: "Name",
    items_col_category: "Category",
    items_col_subcategory: "Subcategory",
    items_col_stock: "Stock",
    items_col_minimum: "Minimum",
    items_col_unit: "Unit",
    items_col_availability: "Availability",
    items_inactive_tag: "Inactive",
    items_empty_title: "No items yet",
    items_empty_filtered: "No items match your filters",
    items_empty_filtered_body: "Try a different search or clear the filters.",
    items_record_status_filter: "Record status",
    items_active_only: "Active items",
    items_inactive_only: "Inactive items",
    items_all_records: "Active and inactive",
    items_details_card: "Item details",
    items_stock_card: "Stock",
    items_current_stock: "Current stock",
    items_minimum_stock: "Minimum stock",
    items_reserved: "Reserved by approved loans",
    items_available_for_loan: "Available for loan",
    items_last_price: "Last purchase price",
    items_movements: "Recent stock movements",
    items_movements_empty: "No stock movements yet.",
    items_col_date: "Date",
    items_col_type: "Type",
    items_col_change: "Change",
    items_col_balance: "Balance after",
    items_col_ref: "Reference",
    items_col_user: "User",
    items_created_at: "Created",
    items_updated_at: "Updated",
    items_staff_stock_note: "Availability only. Ask an Admin for stock numbers.",
    items_barcode_card: "Barcode",
    items_photo_none: "No photo",
    items_not_found_back: "Back to items",
    fields_category: "Category",
    fields_subcategory: "Subcategory",
    fields_unit: "Unit",
    fields_preferred_supplier: "Preferred supplier",
    fields_location: "Storage location",
    common_notes: "Note",
    status_tx_type_in: "Incoming",
    status_tx_type_out: "Outgoing",
    status_tx_type_adjustment: "Adjustment",
    status_tx_type_loan_issue: "Loan issue",
    status_tx_type_loan_return: "Loan return",
    status_tx_type_reversal: "Reversal",
    items_add: "+ Add item",
    items_edit: "Edit item",
    items_deactivate: "Deactivate",
    items_activate: "Activate",
    items_delete: "Delete item",
    items_add_title: "Add item",
    items_edit_title: "Edit item",
    items_section_basic: "Basic details",
    items_section_stock: "Stock",
    items_section_purchasing: "Purchasing and storage",
    items_field_code: "Item code",
    items_field_name: "Item name",
    items_code_hint: "Generated automatically from the category and subcategory, for example AUL-ELK-0001.",
    items_code_auto: "Created when you save",
    items_opening_hint: "Recorded as an adjustment with the reason \"Opening stock\".",
    items_opening_read_only: "Stock is read-only. Use a stock transaction to change it.",
    items_minimum_hint: "You get a Low status when stock reaches this number.",
    items_no_supplier: "No preferred supplier",
    items_save_item: "Save item",
    items_saved_add: "Item added successfully.",
    items_saved_edit: "Item updated successfully.",
    items_deactivate_body: "It stays in history but is hidden from lists, transactions, and loans. You can activate it again.",
    items_activate_body: "It will appear in lists and can be used in transactions and loans again.",
    items_delete_body: "This permanently removes the item. It only works when the item has no transactions or loans.",
    items_deactivated: "Item deactivated.",
    items_activated: "Item activated.",
    items_deleted: "Item deleted.",
    items_field_photo: "Photo",
    items_photo_hint: "JPEG, PNG or WebP, up to 2 MB.",
    items_photo_remove: "Remove photo",
    items_photo_selected: "New photo selected. It is saved with the item.",
    items_photo_save_failed: "The item was saved, but its photo could not be saved. Choose the photo again.",
    item_import_button: "Import CSV",
    item_import_title: "Import items from CSV",
    item_import_desc: "Add many items at once. You see a preview first; nothing is saved until you confirm.",
    item_import_file_label: "CSV file",
    item_import_reading: "Checking the file...",
    item_import_preview_title: "3. Check the preview",
    item_import_col_line: "Line",
    item_import_col_result: "Result",
    item_import_status_ready: "Ready",
    item_import_status_skipped: "Skipped",
    item_import_status_error: "Error",
    item_import_status_imported: "Imported",
    item_import_another: "Choose another file",
    item_import_backup_note: "A backup is taken before the import. Skipped rows and rows with errors are not imported.",
    item_import_confirming: "Importing...",
    item_import_back_to_items: "Back to items",
    fields_name: "Name",
    fields_opening_stock: "Opening stock",
    fields_minimum_stock: "Minimum stock",
    fields_last_price: "Last purchase price (IDR)",
    fields_supplier: "Supplier",
    validation_select_category: "Select a category.",
    validation_select_subcategory: "Select a subcategory.",
    validation_select_unit: "Select a unit.",
    validation_select_supplier: "Select a supplier.",
    errors_photo_empty: "Choose a photo file.",
    errors_photo_type: "The photo must be a JPEG, PNG or WebP image.",
    errors_photo_too_big: "The photo is too large. The limit is 2 MB.",
    common_export_excel: "Export Excel",
    common_exporting: "Exporting...",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
    ui_browse: "Choose file...",
    ui_check_file: "Check file",
    ui_file_path: "File location",
    ui_file_unreadable: "This file cannot be read. Check the location.",
    ui_export_saved_to: "Saved to",
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
    items_title: "Barang",
    items_desc_admin: "Cari, saring, dan kelola barang inventaris.",
    items_desc_staff: "Cek barang yang tersedia sebelum mengajukan pinjam.",
    items_search_placeholder: "Cari nama atau kode",
    items_all_categories: "Semua area",
    items_all_subcategories: "Semua jenis",
    items_stock_status_filter: "Status stok",
    items_availability_filter: "Ketersediaan",
    items_all_stock_status: "Semua status stok",
    items_all_availability: "Semua ketersediaan",
    items_col_name: "Nama",
    items_col_category: "Area",
    items_col_subcategory: "Jenis",
    items_col_stock: "Stok",
    items_col_minimum: "Minimum",
    items_col_unit: "Satuan",
    items_col_availability: "Ketersediaan",
    items_inactive_tag: "Nonaktif",
    items_empty_title: "Belum ada barang",
    items_empty_filtered: "Tidak ada barang yang cocok",
    items_empty_filtered_body: "Coba kata kunci lain atau hapus filter.",
    items_record_status_filter: "Status data",
    items_active_only: "Barang aktif",
    items_inactive_only: "Barang nonaktif",
    items_all_records: "Aktif dan nonaktif",
    items_details_card: "Detail barang",
    items_stock_card: "Stok",
    items_current_stock: "Stok sekarang",
    items_minimum_stock: "Stok minimum",
    items_reserved: "Disiapkan untuk peminjaman yang disetujui",
    items_available_for_loan: "Bisa dipinjam",
    items_last_price: "Harga beli terakhir",
    items_movements: "Pergerakan stok terakhir",
    items_movements_empty: "Belum ada pergerakan stok.",
    items_col_date: "Tanggal",
    items_col_type: "Jenis transaksi",
    items_col_change: "Perubahan",
    items_col_balance: "Sisa stok",
    items_col_ref: "Referensi",
    items_col_user: "Pengguna",
    items_created_at: "Dibuat",
    items_updated_at: "Diubah",
    items_staff_stock_note: "Hanya ketersediaan. Tanyakan ke Admin untuk jumlah stok.",
    items_barcode_card: "Barcode",
    items_photo_none: "Belum ada foto",
    items_not_found_back: "Kembali ke daftar barang",
    fields_category: "Area",
    fields_subcategory: "Jenis",
    fields_unit: "Satuan",
    fields_preferred_supplier: "Supplier langganan",
    fields_location: "Tempat simpan",
    common_notes: "Catatan",
    status_tx_type_in: "Barang masuk",
    status_tx_type_out: "Barang keluar",
    status_tx_type_adjustment: "Penyesuaian",
    status_tx_type_loan_issue: "Diserahkan (pinjam)",
    status_tx_type_loan_return: "Dikembalikan (pinjam)",
    status_tx_type_reversal: "Pembatalan",
    items_add: "+ Tambah barang",
    items_edit: "Ubah barang",
    items_deactivate: "Nonaktifkan",
    items_activate: "Aktifkan",
    items_delete: "Hapus barang",
    items_add_title: "Tambah barang",
    items_edit_title: "Ubah barang",
    items_section_basic: "Data utama",
    items_section_stock: "Stok",
    items_section_purchasing: "Pembelian dan penyimpanan",
    items_field_code: "Kode barang",
    items_field_name: "Nama barang",
    items_code_hint: "Dibuat otomatis dari area dan jenis, misalnya AUL-ELK-0001.",
    items_code_auto: "Dibuat saat disimpan",
    items_opening_hint: "Dicatat sebagai penyesuaian dengan alasan \"Stok awal\".",
    items_opening_read_only: "Stok tidak bisa diubah di sini. Pakai transaksi stok.",
    items_minimum_hint: "Status jadi Menipis saat stok sampai di angka ini.",
    items_no_supplier: "Tidak ada supplier langganan",
    items_save_item: "Simpan barang",
    items_saved_add: "Barang berhasil ditambahkan.",
    items_saved_edit: "Barang berhasil diubah.",
    items_deactivate_body: "Riwayatnya tetap ada, tapi barang ini disembunyikan dari daftar, transaksi, dan peminjaman. Bisa diaktifkan lagi.",
    items_activate_body: "Barang ini muncul lagi di daftar dan bisa dipakai di transaksi dan peminjaman.",
    items_delete_body: "Barang ini dihapus permanen. Hanya bisa kalau barang belum pernah dipakai di transaksi atau peminjaman.",
    items_deactivated: "Barang dinonaktifkan.",
    items_activated: "Barang diaktifkan.",
    items_deleted: "Barang dihapus.",
    items_field_photo: "Foto",
    items_photo_hint: "JPEG, PNG atau WebP, maksimal 2 MB.",
    items_photo_remove: "Hapus foto",
    items_photo_selected: "Foto baru dipilih. Foto disimpan bersama barang.",
    items_photo_save_failed: "Barang tersimpan, tetapi fotonya gagal disimpan. Pilih fotonya lagi.",
    item_import_button: "Impor CSV",
    item_import_title: "Impor barang dari CSV",
    item_import_desc: "Tambah banyak barang sekaligus. Anda lihat pratinjau dulu; belum ada yang disimpan sampai Anda konfirmasi.",
    item_import_file_label: "File CSV",
    item_import_reading: "Sedang mengecek file...",
    item_import_preview_title: "3. Cek pratinjau",
    item_import_col_line: "Baris",
    item_import_col_result: "Hasil",
    item_import_status_ready: "Siap",
    item_import_status_skipped: "Dilewati",
    item_import_status_error: "Bermasalah",
    item_import_status_imported: "Sudah diimpor",
    item_import_another: "Pilih file lain",
    item_import_backup_note: "Data dicadangkan dulu sebelum impor. Baris yang dilewati atau ada error tidak diimpor.",
    item_import_confirming: "Mengimpor...",
    item_import_back_to_items: "Kembali ke daftar barang",
    fields_name: "Nama",
    fields_opening_stock: "Stok awal",
    fields_minimum_stock: "Stok minimum",
    fields_last_price: "Harga beli terakhir (Rp)",
    fields_supplier: "Supplier",
    validation_select_category: "Pilih area.",
    validation_select_subcategory: "Pilih jenis.",
    validation_select_unit: "Pilih satuan.",
    validation_select_supplier: "Pilih supplier.",
    errors_photo_empty: "Pilih file foto.",
    errors_photo_type: "Foto harus berupa gambar JPEG, PNG atau WebP.",
    errors_photo_too_big: "Foto terlalu besar. Batasnya 2 MB.",
    common_export_excel: "Ekspor Excel",
    common_exporting: "Mengekspor...",
    ui_language_id: "Bahasa Indonesia", ui_language_en: "English",
    ui_browse: "Pilih file...",
    ui_check_file: "Cek file",
    ui_file_path: "Lokasi file",
    ui_file_unreadable: "File ini tidak bisa dibaca. Periksa lokasinya.",
    ui_export_saved_to: "Disimpan di",
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

/// `IN`, `OUT`, `ADJUSTMENT`, `LOAN_ISSUE`, `LOAN_RETURN`, `REVERSAL` as the server sends them.
pub fn tx_type_label(lang: Lang, kind: &str) -> String {
    let s = strings(lang);
    match kind {
        "IN" => s.status_tx_type_in,
        "OUT" => s.status_tx_type_out,
        "ADJUSTMENT" => s.status_tx_type_adjustment,
        "LOAN_ISSUE" => s.status_tx_type_loan_issue,
        "LOAN_RETURN" => s.status_tx_type_loan_return,
        "REVERSAL" => s.status_tx_type_reversal,
        other => other,
    }
    .to_string()
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


// More texts with a name or a number inside (the web app's functions of the same names).

pub fn deactivate_title(lang: Lang, name: &str) -> String {
    match lang { Lang::En => format!("Deactivate {name}?"), Lang::Id => format!("Nonaktifkan {name}?") }
}

pub fn activate_title(lang: Lang, name: &str) -> String {
    match lang { Lang::En => format!("Activate {name}?"), Lang::Id => format!("Aktifkan {name}?") }
}

pub fn delete_title(lang: Lang, name: &str) -> String {
    match lang { Lang::En => format!("Delete {name}?"), Lang::Id => format!("Hapus {name}?") }
}

pub fn whole_number(lang: Lang, label: &str) -> String {
    match lang { Lang::En => format!("{label} must be a whole number."), Lang::Id => format!("{label} harus angka bulat.") }
}

pub fn at_least(lang: Lang, label: &str, min: i64) -> String {
    match lang { Lang::En => format!("{label} must be {min} or more."), Lang::Id => format!("{label} minimal {min}.") }
}

pub fn too_long(lang: Lang, label: &str, max: usize) -> String {
    match lang { Lang::En => format!("{label} must be {max} characters or fewer."), Lang::Id => format!("{label} maksimal {max} karakter.") }
}

fn plural(lang: Lang, n: i64, en_one: &str, en_many: &str, id: &str) -> String {
    match lang { Lang::En => if n == 1 { en_one } else { en_many }.to_string(), Lang::Id => id.to_string() }
}

pub fn import_summary_ready(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} ready"), Lang::Id => format!("{n} siap") }
}

pub fn import_summary_skipped(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} skipped"), Lang::Id => format!("{n} dilewati") }
}

pub fn import_summary_errors(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} with errors"), Lang::Id => format!("{n} bermasalah") }
}

pub fn import_confirm(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("Import {n} {}", plural(lang, n, "item", "items", "")), Lang::Id => format!("Impor {n} barang") }
}

pub fn import_done(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} {} imported.", plural(lang, n, "item", "items", "")), Lang::Id => format!("{n} barang berhasil diimpor.") }
}

/// "2 new categories, 1 new subcategory" / "2 area baru, 1 jenis baru".
pub fn import_new_groups(lang: Lang, cats: i64, subs: i64) -> String {
    match lang {
        Lang::En => format!("{cats} new {}, {subs} new {}", plural(lang, cats, "category", "categories", ""), plural(lang, subs, "subcategory", "subcategories", "")),
        Lang::Id => format!("{cats} area baru, {subs} jenis baru"),
    }
}

pub fn import_new_groups_label(lang: Lang, done: bool) -> &'static str {
    match (lang, done) { (Lang::En, true) => "Added:", (Lang::En, false) => "Will be added:", (Lang::Id, true) => "Ditambahkan:", (Lang::Id, false) => "Akan ditambahkan:" }
}

/// "Saved to <path>" for an Excel export written to the Downloads folder.
pub fn export_saved(lang: Lang, path: &str) -> String {
    format!("{} {path}", strings(lang).ui_export_saved_to)
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
    fn transaction_type_labels_equal_the_web_apps_labels() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        for (lang, file) in [(Lang::En, "strings.ts"), (Lang::Id, "strings.id.ts")] {
            let src = std::fs::read_to_string(format!("{dir}{file}")).unwrap();
            let web = web_nested(&src, "txType");
            for kind in ["IN", "OUT", "ADJUSTMENT", "LOAN_ISSUE", "LOAN_RETURN", "REVERSAL"] {
                assert_eq!(tx_type_label(lang, kind), web[kind], "{file} {kind}");
            }
        }
        assert_eq!(tx_type_label(Lang::En, "SOMETHING_NEW"), "SOMETHING_NEW");
    }


    #[test]
    fn item_action_and_import_texts_read_like_the_web_app() {
        assert_eq!((deactivate_title(Lang::En, "Kabel").as_str(), deactivate_title(Lang::Id, "Kabel").as_str()), ("Deactivate Kabel?", "Nonaktifkan Kabel?"));
        assert_eq!((activate_title(Lang::En, "K").as_str(), activate_title(Lang::Id, "K").as_str()), ("Activate K?", "Aktifkan K?"));
        assert_eq!((delete_title(Lang::En, "K").as_str(), delete_title(Lang::Id, "K").as_str()), ("Delete K?", "Hapus K?"));
        assert_eq!(whole_number(Lang::En, "Minimum stock"), "Minimum stock must be a whole number.");
        assert_eq!(at_least(Lang::Id, "Stok awal", 0), "Stok awal minimal 0.");
        assert_eq!(too_long(Lang::En, "Name", 150), "Name must be 150 characters or fewer.");
        assert_eq!((import_summary_ready(Lang::En, 3).as_str(), import_summary_skipped(Lang::Id, 2).as_str(), import_summary_errors(Lang::En, 1).as_str()), ("3 ready", "2 dilewati", "1 with errors"));
        assert_eq!((import_confirm(Lang::En, 1).as_str(), import_confirm(Lang::En, 2).as_str(), import_confirm(Lang::Id, 5).as_str()), ("Import 1 item", "Import 2 items", "Impor 5 barang"));
        assert_eq!((import_done(Lang::En, 1).as_str(), import_done(Lang::Id, 4).as_str()), ("1 item imported.", "4 barang berhasil diimpor."));
        assert_eq!(import_new_groups(Lang::En, 1, 2), "1 new category, 2 new subcategories");
        assert_eq!(import_new_groups(Lang::Id, 1, 2), "1 area baru, 2 jenis baru");
        assert_eq!((import_new_groups_label(Lang::En, false), import_new_groups_label(Lang::Id, true)), ("Will be added:", "Ditambahkan:"));
        assert_eq!(export_saved(Lang::Id, "/x/a.xlsx"), "Disimpan di /x/a.xlsx");
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
            for section in ["app", "nav", "common", "user", "states", "errors", "auth", "fields", "validation", "dashboard", "items", "itemImport"] {
                let web: HashMap<String, String> = web_section(src, section).into_iter().map(|(k, v)| (format!("{}_{}", snake(section), snake(&k)), v)).collect();
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
