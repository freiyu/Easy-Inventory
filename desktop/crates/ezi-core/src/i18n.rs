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
    items_title, items_desc_admin, items_desc_staff, items_search_placeholder, items_all_categories, items_all_subcategories, items_stock_status_filter, items_availability_filter, items_all_stock_status, items_all_availability, items_col_name, items_col_category, items_col_subcategory, items_col_stock, items_col_minimum, items_col_unit, items_col_availability, items_inactive_tag, items_empty_title, items_empty_filtered, items_empty_filtered_body, items_record_status_filter, items_active_only, items_inactive_only, items_all_records, items_details_card, items_stock_card, items_current_stock, items_minimum_stock, items_reserved, items_available_for_loan, items_last_price, items_movements, items_movements_empty, items_col_date, items_col_type, items_col_change, items_col_balance, items_col_ref, items_col_user, items_created_at, items_updated_at, items_staff_stock_note, items_qr_card, items_print_label, items_photo_none, items_not_found_back, fields_category, fields_subcategory, fields_unit, fields_preferred_supplier, fields_location, common_notes, status_tx_type_in, status_tx_type_out, status_tx_type_adjustment, status_tx_type_loan_issue, status_tx_type_loan_return, status_tx_type_reversal,
    items_add, items_edit, items_deactivate, items_activate, items_delete, items_add_title, items_edit_title, items_section_basic, items_section_stock, items_section_purchasing, items_field_code, items_field_name, items_code_hint, items_code_auto, items_opening_hint, items_opening_read_only, items_minimum_hint, items_no_supplier, items_save_item, items_saved_add, items_saved_edit, items_deactivate_body, items_activate_body, items_delete_body, items_deactivated, items_activated, items_deleted, items_field_photo, items_photo_hint, items_photo_remove, items_photo_selected, items_photo_save_failed, item_import_button, item_import_title, item_import_desc, item_import_file_label, item_import_reading, item_import_preview_title, item_import_col_line, item_import_col_result, item_import_status_ready, item_import_status_skipped, item_import_status_error, item_import_status_imported, item_import_another, item_import_backup_note, item_import_confirming, item_import_back_to_items, fields_name, fields_opening_stock, fields_minimum_stock, fields_last_price, fields_supplier, validation_select_category, validation_select_subcategory, validation_select_unit, validation_select_supplier, errors_photo_empty, errors_photo_type, errors_photo_too_big,
    common_export_excel, common_exporting,
    backup_title, backup_description, backup_backup_now, backup_creating, backup_warning, backup_last_backup, backup_last_caption, backup_kept, backup_available, backup_col_file, backup_col_created, backup_col_type, backup_col_size, backup_download, backup_downloading, backup_restore_note, backup_empty_title, backup_empty_body, users_title, users_description, users_add, users_search_placeholder, users_all_roles, users_caption, users_col_name, users_col_email, users_col_role, users_col_status, users_col_last_login, users_never, users_must_change, users_empty_title, users_add_title, users_edit_title, users_add_desc, users_save, users_saved, users_role_hint, users_edit, users_reset_password, users_deactivate, users_activate, users_deactivate_body, users_activate_body, users_reset_body, users_deactivated, users_activated, users_temp_title, users_temp_close, activity_title, activity_description, activity_search_placeholder, activity_all_modules, activity_all_users, activity_caption, activity_col_time, activity_col_user, activity_col_action, activity_col_module, activity_col_ref, activity_col_details, activity_empty_title, activity_empty_filtered, activity_system, profile_title, profile_description, profile_account, profile_last_login, profile_password_card, profile_password_body, fields_role, status_backup_kind_automatic, status_backup_kind_manual, status_backup_kind_before_update, status_backup_kind_before_import, status_backup_kind_before_restore,
    expenses_title, expenses_description, expenses_this_month, expenses_last12, expenses_range_invalid, expenses_range_too_long, expenses_total_value, expenses_total_caption, expenses_purchase_count, expenses_purchase_caption, expenses_by_month, expenses_col_month, expenses_col_purchases, expenses_col_value, expenses_caption, expenses_empty_title, expenses_empty_body, expenses_empty_action, reports_title, reports_description, reports_tab_stock, reports_tab_movements, reports_tab_loans, reports_search_stock, reports_search_movements, reports_search_loans, reports_col_code, reports_col_item, reports_col_category, reports_col_unit, reports_col_stock, reports_col_minimum, reports_col_status, reports_col_date, reports_col_type, reports_col_change, reports_col_balance, reports_col_user, reports_col_ref, reports_col_loan, reports_col_borrower, reports_col_loan_date, reports_col_expected, reports_col_returned, reports_stock_caption, reports_movements_caption, reports_loans_caption, reports_empty_title, reports_empty_body, reports_all_loan_statuses, reports_overdue_highlight, common_from, common_to,
    purchases_title, purchases_desc_admin, purchases_desc_staff, purchases_new, purchases_search_placeholder, purchases_all_requesters, purchases_caption, purchases_tab_all, purchases_tab_closed, purchases_col_number, purchases_col_requester, purchases_col_items, purchases_col_needed_by, purchases_col_status, purchases_empty_title, purchases_empty_admin_body, purchases_empty_staff_body, purchases_empty_filtered, purchases_detail_title, purchases_items_card, purchases_col_item, purchases_col_qty, purchases_col_stock_now, purchases_col_minimum, purchases_col_last_price, purchases_created_on, purchases_needed_by, purchases_reason, purchases_note, purchases_approved_by, purchases_rejected_by, purchases_reject_reason, purchases_received_on, purchases_received_by, purchases_transaction, purchases_progress, purchases_step_done, purchases_step_current, purchases_step_upcoming, purchases_step_submitted, purchases_step_approved, purchases_step_approved_body, purchases_step_received, purchases_step_received_body, purchases_draft_note, purchases_rejected_note, purchases_cancelled_note, purchases_approve_info, purchases_own_request, purchases_approve, purchases_reject, purchases_receive, purchases_cancel, purchases_submit, purchases_edit_draft, purchases_approved, purchases_rejected, purchases_received, purchases_cancelled, purchases_submitted, purchases_draft_saved, purchases_reject_body, purchases_reject_confirm, purchases_receive_body, purchases_receive_new_items_note, purchases_new_item_tag, purchases_line_existing, purchases_line_new, purchases_new_item_hint, purchases_pick_category, purchases_pick_subcategory, purchases_pick_unit, purchases_receive_confirm, purchases_receive_total, purchases_receipt_voided, purchases_cancel_body, purchases_new_title, purchases_edit_title, purchases_form_desc, purchases_section_items, purchases_how_new, purchases_section_when, purchases_section_why, purchases_requester_hint, purchases_add_line, purchases_save_draft, purchases_how_title, purchases_how1, purchases_how2, purchases_how3, purchases_how4, purchases_not_found_back, fields_needed_by, fields_requester, fields_received_date, fields_item_name, validation_select_requester, status_purchase_draft, status_purchase_pending_approval, status_purchase_approved, status_purchase_rejected, status_purchase_received, status_purchase_cancelled,
    loans_title, loans_desc_admin, loans_desc_staff, loans_new_admin, loans_new_staff, loans_search_placeholder, loans_all_borrowers, loans_caption, loans_tab_all, loans_tab_closed, loans_col_number, loans_col_borrower, loans_col_items, loans_col_loan_date, loans_col_expected, loans_col_status, loans_empty_title, loans_empty_admin_body, loans_empty_staff_body, loans_empty_filtered, loans_view, loans_detail_title, loans_items_card, loans_col_item, loans_col_qty, loans_col_stock_now, loans_col_available, loans_borrower, loans_requested_on, loans_loan_date, loans_expected_return, loans_purpose, loans_note, loans_approved_by, loans_rejected_by, loans_reject_reason, loans_issued_by, loans_returned_on, loans_received_by, loans_return_note, loans_progress, loans_step_done, loans_step_current, loans_step_upcoming, loans_step_submitted, loans_step_approved, loans_step_approved_body, loans_step_borrowed, loans_step_borrowed_body, loans_step_completed, loans_step_completed_body, loans_draft_note, loans_rejected_note, loans_cancelled_note, loans_own_request, loans_approve, loans_reject, loans_issue, loans_record_return, loans_cancel, loans_cancel_request, loans_submit, loans_edit_draft, loans_approved, loans_rejected, loans_issued, loans_returned, loans_cancelled, loans_submitted, loans_draft_saved, loans_reject_body, loans_reject_confirm, loans_issue_body, loans_issue_confirm, loans_return_body, loans_return_confirm, loans_cancel_body, loans_new_title, loans_new_request_title, loans_edit_title, loans_form_desc, loans_section_items, loans_section_when, loans_section_why, loans_borrower_hint, loans_add_line, loans_save_draft, loans_not_found_back, fields_loan_date, fields_expected_return, fields_return_date, fields_purpose, fields_return_note, fields_borrower, validation_select_borrower, validation_expected_after_loan,
    fields_destination_hint,
    stock_title, stock_description, stock_incoming, stock_outgoing, stock_adjustment, stock_search_placeholder, stock_all_types, stock_all_statuses, stock_col_number, stock_col_date, stock_col_type, stock_col_items, stock_col_party, stock_col_total, stock_col_user, stock_col_status, stock_empty_title, stock_empty_body, stock_empty_filtered, stock_view, stock_void, stock_in_title, stock_in_desc, stock_out_title, stock_out_desc, stock_adj_title, stock_adj_desc, stock_items_section, stock_out_items_section, stock_add_line, stock_remove_line, stock_note_field, stock_total_purchase, stock_save_in, stock_save_out, stock_save_adj, stock_select_supplier, stock_adj_item_hint, stock_difference_label, stock_no_change, stock_reason_hint, stock_details_card, stock_lines_card, stock_col_item, stock_col_qty, stock_col_change, stock_col_balance, stock_col_unit_price, stock_col_line_total, stock_reason_label, stock_recorded_at, stock_voided_by, stock_reversal_of, stock_linked_loan, stock_void_body, stock_void_confirm, stock_voided, stock_not_found_back, fields_date, fields_destination, fields_quantity, fields_unit_price, fields_reason, fields_physical_stock, fields_system_stock, fields_item, validation_select_item, validation_at_least_one_line, validation_difference_zero, ui_invalid_date, ui_pick_item, status_tx_status_posted, status_tx_status_voided,
    categories_title, categories_description, categories_tab_categories, categories_tab_subcategories, categories_add, categories_search_placeholder, categories_col_name, categories_col_code, categories_col_description, categories_col_items, categories_empty_title, categories_empty_body, categories_add_title, categories_edit_title, categories_save, categories_saved, categories_code_hint, categories_deactivate_body, categories_activate_body, categories_delete_body, categories_deactivated, categories_activated, categories_deleted, subcategories_add, subcategories_search_placeholder, subcategories_empty_title, subcategories_empty_body, subcategories_add_title, subcategories_edit_title, subcategories_save, subcategories_saved, subcategories_code_hint, subcategories_deactivate_body, subcategories_activate_body, subcategories_delete_body, subcategories_deactivated, subcategories_activated, subcategories_deleted, suppliers_title, suppliers_description, suppliers_add, suppliers_search_placeholder, suppliers_col_name, suppliers_col_contact, suppliers_col_phone, suppliers_col_email, suppliers_col_items, suppliers_empty_title, suppliers_empty_body, suppliers_add_title, suppliers_edit_title, suppliers_save, suppliers_saved, suppliers_deactivate_body, suppliers_activate_body, suppliers_delete_body, suppliers_deactivated, suppliers_activated, suppliers_deleted, fields_code, fields_description, fields_contact_person, fields_phone, fields_address, validation_category_code, items_qr_download, ui_active_tag,
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
    items_qr_card: "QR code",
    items_print_label: "Print label",
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
    backup_title: "Database backup",
    backup_description: "Create and download copies of the database.",
    backup_backup_now: "Backup now",
    backup_creating: "Creating backup...",
    backup_warning: "Backups are stored on the host PC only. Download one regularly and copy it to a USB drive or another PC. If the host PC is lost without a copy, the data cannot be recovered.",
    backup_last_backup: "Last backup",
    backup_last_caption: "Automatic backups run once a day",
    backup_kept: "Backups kept",
    backup_available: "Available backups",
    backup_col_file: "File name",
    backup_col_created: "Created",
    backup_col_type: "Type",
    backup_col_size: "Size",
    backup_download: "Download",
    backup_downloading: "Downloading...",
    backup_restore_note: "To restore a backup, use the EZI Restore tool on the host PC (Start Menu). It cannot be done from this page.",
    backup_empty_title: "No backups yet",
    backup_empty_body: "Create the first backup now.",
    users_title: "User management",
    users_description: "Add people, change roles, and reset passwords.",
    users_add: "+ Add user",
    users_search_placeholder: "Search by name or email",
    users_all_roles: "All roles",
    users_caption: "Users",
    users_col_name: "Name",
    users_col_email: "Email",
    users_col_role: "Role",
    users_col_status: "Status",
    users_col_last_login: "Last sign-in",
    users_never: "Never",
    users_must_change: "Must change password",
    users_empty_title: "No users",
    users_add_title: "Add user",
    users_edit_title: "Edit user",
    users_add_desc: "A temporary password is generated. The person must change it at first sign-in.",
    users_save: "Save user",
    users_saved: "User saved.",
    users_role_hint: "Admin manages everything. Staff can request loans and view items.",
    users_edit: "Edit user",
    users_reset_password: "Reset password",
    users_deactivate: "Deactivate",
    users_activate: "Activate",
    users_deactivate_body: "They can no longer sign in. Their history stays. You can activate them again.",
    users_activate_body: "They can sign in again.",
    users_reset_body: "A new temporary password is shown once. They must change it at next sign-in.",
    users_deactivated: "User deactivated.",
    users_activated: "User activated.",
    users_temp_title: "Temporary password",
    users_temp_close: "I have copied it",
    activity_title: "Activity log",
    activity_description: "Who did what, newest first. Entries cannot be edited or deleted.",
    activity_search_placeholder: "Search action, reference, or user",
    activity_all_modules: "All modules",
    activity_all_users: "All users",
    activity_caption: "Activity log",
    activity_col_time: "Time",
    activity_col_user: "User",
    activity_col_action: "Action",
    activity_col_module: "Module",
    activity_col_ref: "Reference",
    activity_col_details: "Details",
    activity_empty_title: "No activity yet",
    activity_empty_filtered: "No entries match your filters",
    activity_system: "System",
    profile_title: "My profile",
    profile_description: "Your account details and password.",
    profile_account: "Account",
    profile_last_login: "Last sign-in",
    profile_password_card: "Change password",
    profile_password_body: "Choose a password you do not use anywhere else.",
    fields_role: "Role",
    status_backup_kind_automatic: "Automatic",
    status_backup_kind_manual: "Manual",
    status_backup_kind_before_update: "Before update",
    status_backup_kind_before_import: "Before import",
    status_backup_kind_before_restore: "Before restore",
    expenses_title: "Expense summary",
    expenses_description: "A simple summary of purchases. Voided purchases are not counted.",
    expenses_this_month: "This month",
    expenses_last12: "Last 12 months",
    expenses_range_invalid: "The end date cannot be before the start date.",
    expenses_range_too_long: "Choose a range of 12 months or less.",
    expenses_total_value: "Total purchase value",
    expenses_total_caption: "Posted incoming stock in this period",
    expenses_purchase_count: "Purchase transactions",
    expenses_purchase_caption: "Incoming stock records",
    expenses_by_month: "By month",
    expenses_col_month: "Month",
    expenses_col_purchases: "Purchases",
    expenses_col_value: "Total value",
    expenses_caption: "Purchases by month",
    expenses_empty_title: "No purchases in this period",
    expenses_empty_body: "Record incoming stock to see purchase totals here.",
    expenses_empty_action: "+ Incoming stock",
    reports_title: "Reports",
    reports_description: "Three reports with filters. Export respects the filters you set.",
    reports_tab_stock: "Stock",
    reports_tab_movements: "Stock movements",
    reports_tab_loans: "Loans",
    reports_search_stock: "Search by name or code",
    reports_search_movements: "Search by item, number, or user",
    reports_search_loans: "Search by loan, borrower, or item",
    reports_col_code: "Code",
    reports_col_item: "Item",
    reports_col_category: "Category",
    reports_col_unit: "Unit",
    reports_col_stock: "Stock",
    reports_col_minimum: "Minimum",
    reports_col_status: "Status",
    reports_col_date: "Date",
    reports_col_type: "Type",
    reports_col_change: "Change",
    reports_col_balance: "Balance after",
    reports_col_user: "User",
    reports_col_ref: "Reference",
    reports_col_loan: "Loan",
    reports_col_borrower: "Borrower",
    reports_col_loan_date: "Loan date",
    reports_col_expected: "Expected return",
    reports_col_returned: "Returned",
    reports_stock_caption: "Stock report",
    reports_movements_caption: "Stock movements report",
    reports_loans_caption: "Loans report",
    reports_empty_title: "No rows match your filters",
    reports_empty_body: "Change or clear the filters to see more.",
    reports_all_loan_statuses: "All statuses",
    reports_overdue_highlight: "Overdue loans are marked with an Overdue badge.",
    common_from: "From",
    common_to: "To",
    purchases_title: "Purchase requests",
    purchases_desc_admin: "Approve requests, then record the items when they arrive.",
    purchases_desc_staff: "Ask for items that are running low or missing. An Admin buys them.",
    purchases_new: "+ New purchase request",
    purchases_search_placeholder: "Search request, person, or item",
    purchases_all_requesters: "All requesters",
    purchases_caption: "Purchase requests",
    purchases_tab_all: "All",
    purchases_tab_closed: "Rejected or cancelled",
    purchases_col_number: "Request number",
    purchases_col_requester: "Requested for",
    purchases_col_items: "Items",
    purchases_col_needed_by: "Needed by",
    purchases_col_status: "Status",
    purchases_empty_title: "No purchase requests yet",
    purchases_empty_admin_body: "Requests appear here once someone asks for an item to be bought.",
    purchases_empty_staff_body: "Ask for an item when it is missing or running low.",
    purchases_empty_filtered: "No purchase requests match your filters",
    purchases_detail_title: "Request details",
    purchases_items_card: "Items requested",
    purchases_col_item: "Item",
    purchases_col_qty: "Quantity",
    purchases_col_stock_now: "Stock now",
    purchases_col_minimum: "Minimum",
    purchases_col_last_price: "Last price",
    purchases_created_on: "Created on",
    purchases_needed_by: "Needed by",
    purchases_reason: "Reason",
    purchases_note: "Note",
    purchases_approved_by: "Approved by",
    purchases_rejected_by: "Rejected by",
    purchases_reject_reason: "Rejection reason",
    purchases_received_on: "Received on",
    purchases_received_by: "Received by",
    purchases_transaction: "Incoming stock record",
    purchases_progress: "Progress",
    purchases_step_done: " (done)",
    purchases_step_current: " (current step)",
    purchases_step_upcoming: " (upcoming)",
    purchases_step_submitted: "Submitted",
    purchases_step_approved: "Approved",
    purchases_step_approved_body: "An Admin agreed to buy the items. Stock does not change yet.",
    purchases_step_received: "Received",
    purchases_step_received_body: "The items arrived and were recorded as incoming stock.",
    purchases_draft_note: "This request is still a draft. Submit it to send it for approval.",
    purchases_rejected_note: "This request was rejected. See the reason in the details.",
    purchases_cancelled_note: "This request was cancelled.",
    purchases_approve_info: "Approving does not change stock. Stock increases when you record that the items arrived.",
    purchases_own_request: "This is your own request. Another Admin must approve or reject it.",
    purchases_approve: "Approve request",
    purchases_reject: "Reject",
    purchases_receive: "Record received",
    purchases_cancel: "Cancel request",
    purchases_submit: "Submit request",
    purchases_edit_draft: "Edit draft",
    purchases_approved: "Purchase request approved.",
    purchases_rejected: "Purchase request rejected.",
    purchases_received: "Items recorded as incoming stock.",
    purchases_cancelled: "Purchase request cancelled.",
    purchases_submitted: "Request submitted for approval.",
    purchases_draft_saved: "Draft saved.",
    purchases_reject_body: "The requester will see your reason.",
    purchases_reject_confirm: "Reject request",
    purchases_receive_body: "Adds the full requested quantities to stock as incoming stock.",
    purchases_receive_new_items_note: "New items are added to the item list when you confirm. Enter a minimum stock for each; the item code is generated automatically. The supplier you choose becomes each new item's preferred supplier.",
    purchases_new_item_tag: "New item",
    purchases_line_existing: "Existing item",
    purchases_line_new: "New item",
    purchases_new_item_hint: "Use the name people will search for.",
    purchases_pick_category: "Select a category",
    purchases_pick_subcategory: "Select a subcategory",
    purchases_pick_unit: "Select a unit",
    purchases_receive_confirm: "Record received",
    purchases_receive_total: "Total purchase value",
    purchases_receipt_voided: "The incoming stock record for this request was voided. The request stays Received. Record a new incoming stock if the items still need to be added.",
    purchases_cancel_body: "The request is closed. This cannot be undone.",
    purchases_new_title: "New purchase request",
    purchases_edit_title: "Edit draft",
    purchases_form_desc: "Choose the items and quantities you need and say why. An Admin approves and buys them.",
    purchases_section_items: "Items needed",
    purchases_how_new: "Not in the list? Choose New item and describe it. An Admin adds it to the item list when it arrives.",
    purchases_section_when: "When",
    purchases_section_why: "Why",
    purchases_requester_hint: "You can create a request on behalf of another person.",
    purchases_add_line: "Add another item",
    purchases_save_draft: "Save as draft",
    purchases_how_title: "How a purchase request works",
    purchases_how1: "Submit your request.",
    purchases_how2: "An Admin approves or rejects it.",
    purchases_how3: "The Admin buys the items.",
    purchases_how4: "When they arrive, the Admin records them and stock increases.",
    purchases_not_found_back: "Back to purchase requests",
    fields_needed_by: "Needed by",
    fields_requester: "Requested for",
    fields_received_date: "Date received",
    fields_item_name: "Item name",
    validation_select_requester: "Select who the request is for.",
    status_purchase_draft: "Draft",
    status_purchase_pending_approval: "Pending Approval",
    status_purchase_approved: "Approved",
    status_purchase_rejected: "Rejected",
    status_purchase_received: "Received",
    status_purchase_cancelled: "Cancelled",
    loans_title: "Loans",
    loans_desc_admin: "Approve requests, hand over items, and record returns.",
    loans_desc_staff: "Your loan requests and the items you have borrowed.",
    loans_new_admin: "+ New loan",
    loans_new_staff: "+ New loan request",
    loans_search_placeholder: "Search loan, borrower, or item",
    loans_all_borrowers: "All borrowers",
    loans_caption: "Loans",
    loans_tab_all: "All",
    loans_tab_closed: "Rejected or cancelled",
    loans_col_number: "Loan number",
    loans_col_borrower: "Borrower",
    loans_col_items: "Items",
    loans_col_loan_date: "Loan date",
    loans_col_expected: "Expected return",
    loans_col_status: "Status",
    loans_empty_title: "No loans yet",
    loans_empty_admin_body: "Loans appear here once someone requests an item.",
    loans_empty_staff_body: "Request an item when you need to borrow it.",
    loans_empty_filtered: "No loans match your filters",
    loans_view: "View details",
    loans_detail_title: "Loan details",
    loans_items_card: "Items requested",
    loans_col_item: "Item",
    loans_col_qty: "Quantity",
    loans_col_stock_now: "Stock now",
    loans_col_available: "Available for loan",
    loans_borrower: "Borrower",
    loans_requested_on: "Requested on",
    loans_loan_date: "Loan date",
    loans_expected_return: "Expected return",
    loans_purpose: "Purpose",
    loans_note: "Note",
    loans_approved_by: "Approved by",
    loans_rejected_by: "Rejected by",
    loans_reject_reason: "Rejection reason",
    loans_issued_by: "Issued by",
    loans_returned_on: "Returned on",
    loans_received_by: "Received by",
    loans_return_note: "Return note",
    loans_progress: "Progress",
    loans_step_done: " (done)",
    loans_step_current: " (current step)",
    loans_step_upcoming: " (upcoming)",
    loans_step_submitted: "Submitted",
    loans_step_approved: "Approved",
    loans_step_approved_body: "Stock is reserved for this loan.",
    loans_step_borrowed: "Borrowed",
    loans_step_borrowed_body: "Items are handed over and stock is reduced.",
    loans_step_completed: "Completed",
    loans_step_completed_body: "All items are back in stock.",
    loans_draft_note: "This request is still a draft. Submit it to send it for approval.",
    loans_rejected_note: "This request was rejected. See the reason in the details.",
    loans_cancelled_note: "This loan was cancelled. Any reserved stock was released.",
    loans_own_request: "This is your own request. Another Admin must approve or reject it.",
    loans_approve: "Approve loan",
    loans_reject: "Reject",
    loans_issue: "Issue items",
    loans_record_return: "Record return",
    loans_cancel: "Cancel loan",
    loans_cancel_request: "Cancel request",
    loans_submit: "Submit request",
    loans_edit_draft: "Edit draft",
    loans_approved: "Loan approved. Stock is reserved.",
    loans_rejected: "Loan rejected.",
    loans_issued: "Items issued. Stock was reduced.",
    loans_returned: "Return recorded. Stock was restored.",
    loans_cancelled: "Loan cancelled.",
    loans_submitted: "Request submitted for approval.",
    loans_draft_saved: "Draft saved.",
    loans_reject_body: "The borrower will see your reason. Nothing is reserved.",
    loans_reject_confirm: "Reject loan",
    loans_issue_body: "Stock is reduced now and the loan becomes Borrowed. Check the items before you confirm.",
    loans_issue_confirm: "Issue items",
    loans_return_body: "All issued quantities go back to stock. Partial returns are not supported. If something is lost or damaged, record a stock adjustment afterwards.",
    loans_return_confirm: "Record return",
    loans_cancel_body: "The request is closed and any reserved stock is released. This cannot be undone.",
    loans_new_title: "New loan",
    loans_new_request_title: "New loan request",
    loans_edit_title: "Edit draft",
    loans_form_desc: "Choose the items, dates, and purpose. An Admin approves the request.",
    loans_section_items: "Items to borrow",
    loans_section_when: "When",
    loans_section_why: "Why",
    loans_borrower_hint: "You can create a loan on behalf of another person.",
    loans_add_line: "Add another item",
    loans_save_draft: "Save as draft",
    loans_not_found_back: "Back to loans",
    fields_loan_date: "Loan date",
    fields_expected_return: "Expected return date",
    fields_return_date: "Return date",
    fields_purpose: "Purpose",
    fields_return_note: "Return note",
    fields_borrower: "Borrower",
    validation_select_borrower: "Select a borrower.",
    validation_expected_after_loan: "Expected return date cannot be before the loan date.",
    fields_destination_hint: "Person or department",
    stock_title: "Stock transactions",
    stock_description: "Every stock change is recorded here. Posted transactions are never edited; use Void to correct a mistake.",
    stock_incoming: "+ Incoming stock",
    stock_outgoing: "Outgoing stock",
    stock_adjustment: "Adjustment",
    stock_search_placeholder: "Search by number, item, or supplier",
    stock_all_types: "All types",
    stock_all_statuses: "All statuses",
    stock_col_number: "Transaction",
    stock_col_date: "Date",
    stock_col_type: "Type",
    stock_col_items: "Items",
    stock_col_party: "Supplier / destination",
    stock_col_total: "Total",
    stock_col_user: "User",
    stock_col_status: "Status",
    stock_empty_title: "No stock transactions yet",
    stock_empty_body: "Record incoming stock when you buy items.",
    stock_empty_filtered: "No transactions match your filters",
    stock_view: "View details",
    stock_void: "Void transaction",
    stock_in_title: "Incoming stock",
    stock_in_desc: "Record items you bought. Stock increases when you save.",
    stock_out_title: "Outgoing stock",
    stock_out_desc: "Record items taken out of stock. Stock cannot go below zero.",
    stock_adj_title: "Stock adjustment",
    stock_adj_desc: "Use this when the physical count differs from the system.",
    stock_items_section: "Items received",
    stock_out_items_section: "Items taken out",
    stock_add_line: "Add another item",
    stock_remove_line: "Remove item",
    stock_note_field: "Note",
    stock_total_purchase: "Total purchase value",
    stock_save_in: "Save incoming stock",
    stock_save_out: "Save outgoing stock",
    stock_save_adj: "Save adjustment",
    stock_select_supplier: "Select a supplier",
    stock_adj_item_hint: "Pick the item you counted.",
    stock_difference_label: "Difference",
    stock_no_change: "No change",
    stock_reason_hint: "Explain why the count differs, for example a stock count or damaged goods.",
    stock_details_card: "Details",
    stock_lines_card: "Lines",
    stock_col_item: "Item",
    stock_col_qty: "Quantity",
    stock_col_change: "Change",
    stock_col_balance: "Balance after",
    stock_col_unit_price: "Unit price",
    stock_col_line_total: "Line total",
    stock_reason_label: "Reason",
    stock_recorded_at: "Recorded",
    stock_voided_by: "Voided by reversal",
    stock_reversal_of: "Reversal of",
    stock_linked_loan: "Loan",
    stock_void_body: "This creates a linked reversal and marks the original as voided. Stock changes back. This cannot be undone.",
    stock_void_confirm: "Void transaction",
    stock_voided: "Transaction voided.",
    stock_not_found_back: "Back to transactions",
    fields_date: "Date",
    fields_destination: "Destination",
    fields_quantity: "Quantity",
    fields_unit_price: "Unit price (IDR)",
    fields_reason: "Reason",
    fields_physical_stock: "Physical stock",
    fields_system_stock: "System stock",
    fields_item: "Item",
    validation_select_item: "Select an item.",
    validation_at_least_one_line: "Add at least one item.",
    validation_difference_zero: "Physical stock equals system stock. There is nothing to adjust.",
    ui_invalid_date: "Use the date format YYYY-MM-DD.",
    ui_pick_item: "Choose an item",
    status_tx_status_posted: "Posted",
    status_tx_status_voided: "Voided",
    categories_title: "Categories",
    categories_description: "Categories are areas, such as a building or room. Subcategories are kinds of item, and every category uses the same list. An item code joins both codes and a number, for example AUL-ELK-0001.",
    categories_tab_categories: "Categories",
    categories_tab_subcategories: "Subcategories",
    categories_add: "+ Add category",
    categories_search_placeholder: "Search categories",
    categories_col_name: "Name",
    categories_col_code: "Code",
    categories_col_description: "Description",
    categories_col_items: "Items",
    categories_empty_title: "No categories yet",
    categories_empty_body: "Add a category before you add items.",
    categories_add_title: "Add category",
    categories_edit_title: "Edit category",
    categories_save: "Save category",
    categories_saved: "Category saved.",
    categories_code_hint: "3 letters, the first part of item codes (AUL in AUL-ELK-0001). Cannot be changed once an item uses it.",
    categories_deactivate_body: "Inactive categories cannot be chosen for new items. Existing items keep their category.",
    categories_activate_body: "This category can be chosen for items again.",
    categories_delete_body: "This permanently removes the category. It only works when no item or purchase request has ever used it.",
    categories_deactivated: "Category deactivated.",
    categories_activated: "Category activated.",
    categories_deleted: "Category deleted.",
    subcategories_add: "+ Add subcategory",
    subcategories_search_placeholder: "Search subcategories",
    subcategories_empty_title: "No subcategories yet",
    subcategories_empty_body: "Add the kinds of item, such as Electronics (ELK), before you add items.",
    subcategories_add_title: "Add subcategory",
    subcategories_edit_title: "Edit subcategory",
    subcategories_save: "Save subcategory",
    subcategories_saved: "Subcategory saved.",
    subcategories_code_hint: "3 letters, the middle part of item codes (ELK in AUL-ELK-0001). Cannot be changed once an item uses it.",
    subcategories_deactivate_body: "Inactive subcategories cannot be chosen for new items. Existing items keep their subcategory.",
    subcategories_activate_body: "This subcategory can be chosen for items again.",
    subcategories_delete_body: "This permanently removes the subcategory. It only works when no item or purchase request has ever used it.",
    subcategories_deactivated: "Subcategory deactivated.",
    subcategories_activated: "Subcategory activated.",
    subcategories_deleted: "Subcategory deleted.",
    suppliers_title: "Suppliers",
    suppliers_description: "Keep supplier contacts for incoming stock.",
    suppliers_add: "+ Add supplier",
    suppliers_search_placeholder: "Search suppliers",
    suppliers_col_name: "Name",
    suppliers_col_contact: "Contact person",
    suppliers_col_phone: "Phone",
    suppliers_col_email: "Email",
    suppliers_col_items: "Preferred for",
    suppliers_empty_title: "No suppliers yet",
    suppliers_empty_body: "Add a supplier before you record incoming stock.",
    suppliers_add_title: "Add supplier",
    suppliers_edit_title: "Edit supplier",
    suppliers_save: "Save supplier",
    suppliers_saved: "Supplier saved.",
    suppliers_deactivate_body: "Inactive suppliers cannot be chosen for new incoming stock. Past purchases stay in history.",
    suppliers_activate_body: "This supplier can be chosen for incoming stock again.",
    suppliers_delete_body: "This permanently removes the supplier. It only works when no item or purchase uses it.",
    suppliers_deactivated: "Supplier deactivated.",
    suppliers_activated: "Supplier activated.",
    suppliers_deleted: "Supplier deleted.",
    fields_code: "Code",
    fields_description: "Description",
    fields_contact_person: "Contact person",
    fields_phone: "Phone",
    fields_address: "Address",
    validation_category_code: "Use exactly 3 letters, for example KTR.",
    items_qr_download: "Download PNG",
    ui_active_tag: "Active",
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
    items_qr_card: "Kode QR",
    items_print_label: "Cetak label",
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
    backup_title: "Cadangan data",
    backup_description: "Buat dan unduh salinan database.",
    backup_backup_now: "Cadangkan sekarang",
    backup_creating: "Sedang mencadangkan...",
    backup_warning: "Cadangan hanya tersimpan di PC server. Unduh secara rutin dan salin ke flashdisk atau PC lain. Kalau PC server hilang atau rusak tanpa salinan, data tidak bisa dikembalikan.",
    backup_last_backup: "Cadangan terakhir",
    backup_last_caption: "Cadangan otomatis dibuat sekali sehari",
    backup_kept: "Cadangan yang disimpan",
    backup_available: "Daftar cadangan",
    backup_col_file: "Nama file",
    backup_col_created: "Dibuat",
    backup_col_type: "Tipe cadangan",
    backup_col_size: "Ukuran",
    backup_download: "Unduh",
    backup_downloading: "Mengunduh...",
    backup_restore_note: "Untuk memulihkan cadangan, pakai alat EZI Restore di PC server (Start Menu). Tidak bisa dari halaman ini.",
    backup_empty_title: "Belum ada cadangan",
    backup_empty_body: "Buat cadangan pertama sekarang.",
    users_title: "Kelola pengguna",
    users_description: "Tambah orang, ubah peran, dan reset password.",
    users_add: "+ Tambah pengguna",
    users_search_placeholder: "Cari nama atau email",
    users_all_roles: "Semua peran",
    users_caption: "Pengguna",
    users_col_name: "Nama",
    users_col_email: "Email",
    users_col_role: "Peran",
    users_col_status: "Status",
    users_col_last_login: "Terakhir masuk",
    users_never: "Belum pernah",
    users_must_change: "Harus ganti password",
    users_empty_title: "Belum ada pengguna",
    users_add_title: "Tambah pengguna",
    users_edit_title: "Ubah pengguna",
    users_add_desc: "Password sementara dibuat otomatis. Orangnya harus menggantinya saat pertama masuk.",
    users_save: "Simpan pengguna",
    users_saved: "Pengguna disimpan.",
    users_role_hint: "Admin mengelola semuanya. Staff bisa mengajukan pinjam dan melihat barang.",
    users_edit: "Ubah pengguna",
    users_reset_password: "Reset password",
    users_deactivate: "Nonaktifkan",
    users_activate: "Aktifkan",
    users_deactivate_body: "Orang ini tidak bisa masuk lagi. Riwayatnya tetap ada. Bisa diaktifkan lagi.",
    users_activate_body: "Orang ini bisa masuk lagi.",
    users_reset_body: "Password sementara baru ditampilkan sekali. Orangnya harus menggantinya saat masuk berikutnya.",
    users_deactivated: "Pengguna dinonaktifkan.",
    users_activated: "Pengguna diaktifkan.",
    users_temp_title: "Password sementara",
    users_temp_close: "Sudah saya salin",
    activity_title: "Riwayat aktivitas",
    activity_description: "Siapa melakukan apa, yang terbaru di atas. Catatan tidak bisa diubah atau dihapus.",
    activity_search_placeholder: "Cari aksi, referensi, atau pengguna",
    activity_all_modules: "Semua modul",
    activity_all_users: "Semua pengguna",
    activity_caption: "Riwayat aktivitas",
    activity_col_time: "Waktu",
    activity_col_user: "Pengguna",
    activity_col_action: "Aksi",
    activity_col_module: "Modul",
    activity_col_ref: "Referensi",
    activity_col_details: "Detail",
    activity_empty_title: "Belum ada aktivitas",
    activity_empty_filtered: "Tidak ada catatan yang cocok",
    activity_system: "Sistem",
    profile_title: "Profil saya",
    profile_description: "Data akun dan password Anda.",
    profile_account: "Akun",
    profile_last_login: "Terakhir masuk",
    profile_password_card: "Ganti password",
    profile_password_body: "Pakai password yang tidak Anda pakai di tempat lain.",
    fields_role: "Peran",
    status_backup_kind_automatic: "Otomatis",
    status_backup_kind_manual: "Manual",
    status_backup_kind_before_update: "Sebelum pembaruan",
    status_backup_kind_before_import: "Sebelum impor",
    status_backup_kind_before_restore: "Sebelum pemulihan",
    expenses_title: "Ringkasan pengeluaran",
    expenses_description: "Ringkasan sederhana pembelian barang. Pembelian yang dibatalkan tidak dihitung.",
    expenses_this_month: "Bulan ini",
    expenses_last12: "12 bulan terakhir",
    expenses_range_invalid: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    expenses_range_too_long: "Pilih rentang paling lama 12 bulan.",
    expenses_total_value: "Total nilai pembelian",
    expenses_total_caption: "Barang masuk yang tercatat di periode ini",
    expenses_purchase_count: "Transaksi pembelian",
    expenses_purchase_caption: "Catatan barang masuk",
    expenses_by_month: "Per bulan",
    expenses_col_month: "Bulan",
    expenses_col_purchases: "Pembelian",
    expenses_col_value: "Total nilai",
    expenses_caption: "Pembelian per bulan",
    expenses_empty_title: "Tidak ada pembelian di periode ini",
    expenses_empty_body: "Catat barang masuk supaya total pembelian muncul di sini.",
    expenses_empty_action: "+ Barang masuk",
    reports_title: "Laporan",
    reports_description: "Tiga laporan dengan filter. Ekspor mengikuti filter yang Anda pilih.",
    reports_tab_stock: "Stok",
    reports_tab_movements: "Pergerakan stok",
    reports_tab_loans: "Peminjaman",
    reports_search_stock: "Cari nama atau kode",
    reports_search_movements: "Cari barang, nomor, atau pengguna",
    reports_search_loans: "Cari nomor, peminjam, atau barang",
    reports_col_code: "Kode",
    reports_col_item: "Barang",
    reports_col_category: "Area",
    reports_col_unit: "Satuan",
    reports_col_stock: "Stok",
    reports_col_minimum: "Minimum",
    reports_col_status: "Status",
    reports_col_date: "Tanggal",
    reports_col_type: "Jenis transaksi",
    reports_col_change: "Perubahan",
    reports_col_balance: "Sisa stok",
    reports_col_user: "Pengguna",
    reports_col_ref: "Referensi",
    reports_col_loan: "Peminjaman",
    reports_col_borrower: "Peminjam",
    reports_col_loan_date: "Tanggal pinjam",
    reports_col_expected: "Rencana kembali",
    reports_col_returned: "Dikembalikan",
    reports_stock_caption: "Laporan stok",
    reports_movements_caption: "Laporan pergerakan stok",
    reports_loans_caption: "Laporan peminjaman",
    reports_empty_title: "Tidak ada data yang cocok",
    reports_empty_body: "Ubah atau hapus filter untuk melihat lebih banyak.",
    reports_all_loan_statuses: "Semua status",
    reports_overdue_highlight: "Peminjaman yang terlambat ditandai label Terlambat.",
    common_from: "Dari",
    common_to: "Sampai",
    purchases_title: "Pengajuan beli",
    purchases_desc_admin: "Setujui pengajuan, lalu catat barangnya saat datang.",
    purchases_desc_staff: "Ajukan barang yang hampir habis atau belum ada. Admin yang membelinya.",
    purchases_new: "+ Pengajuan beli baru",
    purchases_search_placeholder: "Cari nomor, orang, atau barang",
    purchases_all_requesters: "Semua pengaju",
    purchases_caption: "Pengajuan beli",
    purchases_tab_all: "Semua",
    purchases_tab_closed: "Ditolak atau dibatalkan",
    purchases_col_number: "Nomor pengajuan",
    purchases_col_requester: "Diajukan untuk",
    purchases_col_items: "Barang",
    purchases_col_needed_by: "Dibutuhkan tanggal",
    purchases_col_status: "Status",
    purchases_empty_title: "Belum ada pengajuan beli",
    purchases_empty_admin_body: "Pengajuan muncul di sini setelah ada yang minta barang dibelikan.",
    purchases_empty_staff_body: "Ajukan barang kalau belum ada atau hampir habis.",
    purchases_empty_filtered: "Tidak ada pengajuan beli yang cocok",
    purchases_detail_title: "Detail pengajuan",
    purchases_items_card: "Barang yang diajukan",
    purchases_col_item: "Barang",
    purchases_col_qty: "Jumlah",
    purchases_col_stock_now: "Stok sekarang",
    purchases_col_minimum: "Minimum",
    purchases_col_last_price: "Harga terakhir",
    purchases_created_on: "Dibuat pada",
    purchases_needed_by: "Dibutuhkan tanggal",
    purchases_reason: "Alasan",
    purchases_note: "Catatan",
    purchases_approved_by: "Disetujui oleh",
    purchases_rejected_by: "Ditolak oleh",
    purchases_reject_reason: "Alasan ditolak",
    purchases_received_on: "Diterima pada",
    purchases_received_by: "Diterima oleh",
    purchases_transaction: "Catatan barang masuk",
    purchases_progress: "Progres",
    purchases_step_done: " (selesai)",
    purchases_step_current: " (langkah sekarang)",
    purchases_step_upcoming: " (berikutnya)",
    purchases_step_submitted: "Diajukan",
    purchases_step_approved: "Disetujui",
    purchases_step_approved_body: "Admin setuju membeli barangnya. Stok belum berubah.",
    purchases_step_received: "Sudah diterima",
    purchases_step_received_body: "Barang sudah datang dan dicatat sebagai barang masuk.",
    purchases_draft_note: "Pengajuan ini masih draf. Ajukan supaya dikirim untuk disetujui.",
    purchases_rejected_note: "Pengajuan ini ditolak. Lihat alasannya di detail.",
    purchases_cancelled_note: "Pengajuan ini dibatalkan.",
    purchases_approve_info: "Menyetujui tidak mengubah stok. Stok bertambah saat Anda mencatat barangnya sudah datang.",
    purchases_own_request: "Ini pengajuan Anda sendiri. Admin lain yang harus menyetujui atau menolaknya.",
    purchases_approve: "Setujui pengajuan",
    purchases_reject: "Tolak",
    purchases_receive: "Catat barang datang",
    purchases_cancel: "Batalkan pengajuan",
    purchases_submit: "Ajukan",
    purchases_edit_draft: "Ubah draf",
    purchases_approved: "Pengajuan beli disetujui.",
    purchases_rejected: "Pengajuan beli ditolak.",
    purchases_received: "Barang dicatat sebagai barang masuk.",
    purchases_cancelled: "Pengajuan beli dibatalkan.",
    purchases_submitted: "Pengajuan dikirim untuk disetujui.",
    purchases_draft_saved: "Draf disimpan.",
    purchases_reject_body: "Pengaju akan melihat alasan Anda.",
    purchases_reject_confirm: "Tolak pengajuan",
    purchases_receive_body: "Semua jumlah yang diajukan ditambahkan ke stok sebagai barang masuk.",
    purchases_receive_new_items_note: "Barang baru ditambahkan ke daftar barang saat Anda konfirmasi. Isi stok minimum untuk masing-masing; kode barang dibuat otomatis. Supplier yang dipilih jadi supplier langganan barang baru itu.",
    purchases_new_item_tag: "Barang baru",
    purchases_line_existing: "Barang lama",
    purchases_line_new: "Barang baru",
    purchases_new_item_hint: "Pakai nama yang biasa dicari orang.",
    purchases_pick_category: "Pilih area",
    purchases_pick_subcategory: "Pilih jenis",
    purchases_pick_unit: "Pilih satuan",
    purchases_receive_confirm: "Catat barang datang",
    purchases_receive_total: "Total nilai pembelian",
    purchases_receipt_voided: "Catatan barang masuk untuk pengajuan ini sudah dibatalkan. Status pengajuan tetap Sudah diterima. Catat barang masuk baru kalau barangnya masih perlu ditambahkan.",
    purchases_cancel_body: "Pengajuan ditutup. Tidak bisa diurungkan.",
    purchases_new_title: "Pengajuan beli baru",
    purchases_edit_title: "Ubah draf",
    purchases_form_desc: "Pilih barang dan jumlah yang dibutuhkan, lalu tulis alasannya. Admin yang menyetujui dan membelinya.",
    purchases_section_items: "Barang yang dibutuhkan",
    purchases_how_new: "Tidak ada di daftar? Pilih Barang baru dan tulis nama barangnya. Admin menambahkannya ke daftar barang saat barangnya datang.",
    purchases_section_when: "Kapan",
    purchases_section_why: "Untuk apa",
    purchases_requester_hint: "Anda bisa membuat pengajuan atas nama orang lain.",
    purchases_add_line: "Tambah barang lain",
    purchases_save_draft: "Simpan sebagai draf",
    purchases_how_title: "Cara pengajuan beli",
    purchases_how1: "Ajukan barang yang dibutuhkan.",
    purchases_how2: "Admin menyetujui atau menolak.",
    purchases_how3: "Admin membeli barangnya.",
    purchases_how4: "Saat barang datang, Admin mencatatnya dan stok bertambah.",
    purchases_not_found_back: "Kembali ke pengajuan beli",
    fields_needed_by: "Dibutuhkan tanggal",
    fields_requester: "Diajukan untuk",
    fields_received_date: "Tanggal diterima",
    fields_item_name: "Nama barang",
    validation_select_requester: "Pilih untuk siapa pengajuan ini.",
    status_purchase_draft: "Draf",
    status_purchase_pending_approval: "Menunggu persetujuan",
    status_purchase_approved: "Disetujui",
    status_purchase_rejected: "Ditolak",
    status_purchase_received: "Sudah diterima",
    status_purchase_cancelled: "Dibatalkan",
    loans_title: "Peminjaman",
    loans_desc_admin: "Setujui pengajuan, serahkan barang, dan catat pengembalian.",
    loans_desc_staff: "Pengajuan pinjam Anda dan barang yang sedang Anda pinjam.",
    loans_new_admin: "+ Peminjaman baru",
    loans_new_staff: "+ Ajukan pinjam",
    loans_search_placeholder: "Cari nomor, peminjam, atau barang",
    loans_all_borrowers: "Semua peminjam",
    loans_caption: "Peminjaman",
    loans_tab_all: "Semua",
    loans_tab_closed: "Ditolak atau dibatalkan",
    loans_col_number: "Nomor pinjam",
    loans_col_borrower: "Peminjam",
    loans_col_items: "Barang",
    loans_col_loan_date: "Tanggal pinjam",
    loans_col_expected: "Rencana kembali",
    loans_col_status: "Status",
    loans_empty_title: "Belum ada peminjaman",
    loans_empty_admin_body: "Peminjaman muncul di sini setelah ada yang mengajukan pinjam.",
    loans_empty_staff_body: "Ajukan pinjam kalau Anda butuh barang.",
    loans_empty_filtered: "Tidak ada peminjaman yang cocok",
    loans_view: "Lihat detail",
    loans_detail_title: "Detail peminjaman",
    loans_items_card: "Barang yang dipinjam",
    loans_col_item: "Barang",
    loans_col_qty: "Jumlah",
    loans_col_stock_now: "Stok sekarang",
    loans_col_available: "Bisa dipinjam",
    loans_borrower: "Peminjam",
    loans_requested_on: "Diajukan pada",
    loans_loan_date: "Tanggal pinjam",
    loans_expected_return: "Rencana kembali",
    loans_purpose: "Keperluan",
    loans_note: "Catatan",
    loans_approved_by: "Disetujui oleh",
    loans_rejected_by: "Ditolak oleh",
    loans_reject_reason: "Alasan ditolak",
    loans_issued_by: "Diserahkan oleh",
    loans_returned_on: "Dikembalikan pada",
    loans_received_by: "Diterima oleh",
    loans_return_note: "Catatan pengembalian",
    loans_progress: "Progres",
    loans_step_done: " (selesai)",
    loans_step_current: " (langkah sekarang)",
    loans_step_upcoming: " (berikutnya)",
    loans_step_submitted: "Diajukan",
    loans_step_approved: "Disetujui",
    loans_step_approved_body: "Stok sudah disiapkan untuk peminjaman ini.",
    loans_step_borrowed: "Sedang dipinjam",
    loans_step_borrowed_body: "Barang sudah diserahkan dan stok berkurang.",
    loans_step_completed: "Selesai",
    loans_step_completed_body: "Semua barang sudah kembali ke stok.",
    loans_draft_note: "Pengajuan ini masih draf. Ajukan supaya dikirim untuk disetujui.",
    loans_rejected_note: "Pengajuan ini ditolak. Lihat alasannya di detail.",
    loans_cancelled_note: "Peminjaman ini dibatalkan. Stok yang sempat disiapkan sudah dilepas.",
    loans_own_request: "Ini pengajuan Anda sendiri. Admin lain yang harus menyetujui atau menolaknya.",
    loans_approve: "Setujui peminjaman",
    loans_reject: "Tolak",
    loans_issue: "Serahkan barang",
    loans_record_return: "Catat pengembalian",
    loans_cancel: "Batalkan peminjaman",
    loans_cancel_request: "Batalkan pengajuan",
    loans_submit: "Ajukan",
    loans_edit_draft: "Ubah draf",
    loans_approved: "Peminjaman disetujui. Stok sudah disiapkan.",
    loans_rejected: "Peminjaman ditolak.",
    loans_issued: "Barang diserahkan. Stok berkurang.",
    loans_returned: "Pengembalian dicatat. Stok kembali.",
    loans_cancelled: "Peminjaman dibatalkan.",
    loans_submitted: "Pengajuan dikirim untuk disetujui.",
    loans_draft_saved: "Draf disimpan.",
    loans_reject_body: "Peminjam akan melihat alasan Anda. Tidak ada stok yang disiapkan.",
    loans_reject_confirm: "Tolak peminjaman",
    loans_issue_body: "Stok langsung berkurang dan status jadi Sedang dipinjam. Cek barangnya sebelum konfirmasi.",
    loans_issue_confirm: "Serahkan barang",
    loans_return_body: "Semua barang yang diserahkan kembali ke stok. Pengembalian sebagian tidak bisa. Kalau ada yang hilang atau rusak, catat penyesuaian stok setelahnya.",
    loans_return_confirm: "Catat pengembalian",
    loans_cancel_body: "Pengajuan ditutup dan stok yang disiapkan dilepas. Tidak bisa diurungkan.",
    loans_new_title: "Peminjaman baru",
    loans_new_request_title: "Ajukan pinjam",
    loans_edit_title: "Ubah draf",
    loans_form_desc: "Pilih barang, tanggal, dan keperluan. Admin yang menyetujui pengajuan.",
    loans_section_items: "Barang yang dipinjam",
    loans_section_when: "Kapan",
    loans_section_why: "Untuk apa",
    loans_borrower_hint: "Anda bisa membuat peminjaman atas nama orang lain.",
    loans_add_line: "Tambah barang lain",
    loans_save_draft: "Simpan sebagai draf",
    loans_not_found_back: "Kembali ke peminjaman",
    fields_loan_date: "Tanggal pinjam",
    fields_expected_return: "Rencana tanggal kembali",
    fields_return_date: "Tanggal dikembalikan",
    fields_purpose: "Keperluan",
    fields_return_note: "Catatan pengembalian",
    fields_borrower: "Peminjam",
    validation_select_borrower: "Pilih peminjam.",
    validation_expected_after_loan: "Tanggal kembali tidak boleh sebelum tanggal pinjam.",
    fields_destination_hint: "Nama orang atau bagian",
    stock_title: "Transaksi stok",
    stock_description: "Setiap perubahan stok tercatat di sini. Transaksi yang sudah tercatat tidak diubah; pakai Batalkan transaksi untuk memperbaiki kesalahan.",
    stock_incoming: "+ Barang masuk",
    stock_outgoing: "Barang keluar",
    stock_adjustment: "Penyesuaian stok",
    stock_search_placeholder: "Cari nomor, barang, atau supplier",
    stock_all_types: "Semua jenis transaksi",
    stock_all_statuses: "Semua status",
    stock_col_number: "Transaksi",
    stock_col_date: "Tanggal",
    stock_col_type: "Jenis transaksi",
    stock_col_items: "Barang",
    stock_col_party: "Supplier / tujuan",
    stock_col_total: "Total",
    stock_col_user: "Pengguna",
    stock_col_status: "Status",
    stock_empty_title: "Belum ada transaksi stok",
    stock_empty_body: "Catat barang masuk saat membeli barang.",
    stock_empty_filtered: "Tidak ada transaksi yang cocok",
    stock_view: "Lihat detail",
    stock_void: "Batalkan transaksi",
    stock_in_title: "Barang masuk",
    stock_in_desc: "Catat barang yang Anda beli. Stok bertambah saat disimpan.",
    stock_out_title: "Barang keluar",
    stock_out_desc: "Catat barang yang diambil dari stok. Stok tidak bisa kurang dari nol.",
    stock_adj_title: "Penyesuaian stok",
    stock_adj_desc: "Pakai ini kalau hitungan fisik berbeda dengan sistem.",
    stock_items_section: "Barang yang diterima",
    stock_out_items_section: "Barang yang keluar",
    stock_add_line: "Tambah barang lain",
    stock_remove_line: "Hapus baris",
    stock_note_field: "Catatan",
    stock_total_purchase: "Total nilai pembelian",
    stock_save_in: "Simpan barang masuk",
    stock_save_out: "Simpan barang keluar",
    stock_save_adj: "Simpan penyesuaian",
    stock_select_supplier: "Pilih supplier",
    stock_adj_item_hint: "Pilih barang yang Anda hitung.",
    stock_difference_label: "Selisih",
    stock_no_change: "Tidak ada perubahan",
    stock_reason_hint: "Jelaskan kenapa hitungannya berbeda, misalnya hasil stok opname atau barang rusak.",
    stock_details_card: "Detail",
    stock_lines_card: "Rincian barang",
    stock_col_item: "Barang",
    stock_col_qty: "Jumlah",
    stock_col_change: "Perubahan",
    stock_col_balance: "Sisa stok",
    stock_col_unit_price: "Harga satuan",
    stock_col_line_total: "Subtotal",
    stock_reason_label: "Alasan",
    stock_recorded_at: "Dicatat",
    stock_voided_by: "Dibatalkan oleh",
    stock_reversal_of: "Pembatalan dari",
    stock_linked_loan: "Peminjaman",
    stock_void_body: "Ini membuat transaksi pembatalan dan menandai transaksi asli sebagai dibatalkan. Stok kembali seperti sebelumnya. Tidak bisa diurungkan.",
    stock_void_confirm: "Batalkan transaksi",
    stock_voided: "Transaksi dibatalkan.",
    stock_not_found_back: "Kembali ke transaksi",
    fields_date: "Tanggal",
    fields_destination: "Tujuan",
    fields_quantity: "Jumlah",
    fields_unit_price: "Harga satuan (Rp)",
    fields_reason: "Alasan",
    fields_physical_stock: "Stok fisik",
    fields_system_stock: "Stok di sistem",
    fields_item: "Barang",
    validation_select_item: "Pilih barang.",
    validation_at_least_one_line: "Tambahkan minimal satu barang.",
    validation_difference_zero: "Stok fisik sama dengan stok di sistem. Tidak ada yang perlu disesuaikan.",
    ui_invalid_date: "Pakai format tanggal TTTT-BB-HH.",
    ui_pick_item: "Pilih barang",
    status_tx_status_posted: "Tercatat",
    status_tx_status_voided: "Dibatalkan",
    categories_title: "Area dan jenis",
    categories_description: "Area adalah tempat, misalnya gedung atau ruangan. Jenis adalah macam barang, dan semua area memakai daftar jenis yang sama. Kode barang gabungan kode area, kode jenis, dan nomor, misalnya AUL-ELK-0001.",
    categories_tab_categories: "Area",
    categories_tab_subcategories: "Jenis",
    categories_add: "+ Tambah area",
    categories_search_placeholder: "Cari area",
    categories_col_name: "Nama",
    categories_col_code: "Kode",
    categories_col_description: "Keterangan",
    categories_col_items: "Barang",
    categories_empty_title: "Belum ada area",
    categories_empty_body: "Tambahkan area sebelum menambah barang.",
    categories_add_title: "Tambah area",
    categories_edit_title: "Ubah area",
    categories_save: "Simpan area",
    categories_saved: "Area disimpan.",
    categories_code_hint: "3 huruf, bagian depan kode barang (AUL di AUL-ELK-0001). Tidak bisa diubah setelah dipakai barang.",
    categories_deactivate_body: "Area nonaktif tidak bisa dipilih untuk barang baru. Barang yang sudah ada tetap di areanya.",
    categories_activate_body: "Area ini bisa dipilih lagi untuk barang.",
    categories_delete_body: "Area ini dihapus permanen. Hanya bisa kalau belum pernah dipakai barang atau pengajuan beli.",
    categories_deactivated: "Area dinonaktifkan.",
    categories_activated: "Area diaktifkan.",
    categories_deleted: "Area dihapus.",
    subcategories_add: "+ Tambah jenis",
    subcategories_search_placeholder: "Cari jenis",
    subcategories_empty_title: "Belum ada jenis",
    subcategories_empty_body: "Tambahkan macam barang, misalnya Elektronik (ELK), sebelum menambah barang.",
    subcategories_add_title: "Tambah jenis",
    subcategories_edit_title: "Ubah jenis",
    subcategories_save: "Simpan jenis",
    subcategories_saved: "Jenis disimpan.",
    subcategories_code_hint: "3 huruf, bagian tengah kode barang (ELK di AUL-ELK-0001). Tidak bisa diubah setelah dipakai barang.",
    subcategories_deactivate_body: "Jenis nonaktif tidak bisa dipilih untuk barang baru. Barang yang sudah ada tetap di jenisnya.",
    subcategories_activate_body: "Jenis ini bisa dipilih lagi untuk barang.",
    subcategories_delete_body: "Jenis ini dihapus permanen. Hanya bisa kalau belum pernah dipakai barang atau pengajuan beli.",
    subcategories_deactivated: "Jenis dinonaktifkan.",
    subcategories_activated: "Jenis diaktifkan.",
    subcategories_deleted: "Jenis dihapus.",
    suppliers_title: "Supplier",
    suppliers_description: "Simpan kontak supplier untuk barang masuk.",
    suppliers_add: "+ Tambah supplier",
    suppliers_search_placeholder: "Cari supplier",
    suppliers_col_name: "Nama",
    suppliers_col_contact: "Nama kontak",
    suppliers_col_phone: "Telepon",
    suppliers_col_email: "Email",
    suppliers_col_items: "Langganan untuk",
    suppliers_empty_title: "Belum ada supplier",
    suppliers_empty_body: "Tambahkan supplier sebelum mencatat barang masuk.",
    suppliers_add_title: "Tambah supplier",
    suppliers_edit_title: "Ubah supplier",
    suppliers_save: "Simpan supplier",
    suppliers_saved: "Supplier disimpan.",
    suppliers_deactivate_body: "Supplier nonaktif tidak bisa dipilih untuk barang masuk baru. Pembelian lama tetap ada di riwayat.",
    suppliers_activate_body: "Supplier ini bisa dipilih lagi untuk barang masuk.",
    suppliers_delete_body: "Supplier ini dihapus permanen. Hanya bisa kalau belum dipakai barang atau pembelian.",
    suppliers_deactivated: "Supplier dinonaktifkan.",
    suppliers_activated: "Supplier diaktifkan.",
    suppliers_deleted: "Supplier dihapus.",
    fields_code: "Kode",
    fields_description: "Keterangan",
    fields_contact_person: "Nama kontak",
    fields_phone: "Telepon",
    fields_address: "Alamat",
    validation_category_code: "Pakai tepat 3 huruf, misalnya KTR.",
    items_qr_download: "Unduh PNG",
    ui_active_tag: "Aktif",
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

pub fn stock_more_items(lang: Lang, n: usize) -> String {
    match lang { Lang::En => format!("+{n} more"), Lang::Id => format!("+{n} lainnya") }
}

/// "Incoming stock IN-0001 saved." for `kind` `IN`, `OUT` or `ADJUSTMENT`.
pub fn stock_saved(lang: Lang, kind: &str, number: &str) -> String {
    match (lang, kind) {
        (Lang::En, "IN") => format!("Incoming stock {number} saved."),
        (Lang::En, "OUT") => format!("Outgoing stock {number} saved."),
        (Lang::En, _) => format!("Adjustment {number} saved."),
        (Lang::Id, "IN") => format!("Barang masuk {number} disimpan."),
        (Lang::Id, "OUT") => format!("Barang keluar {number} disimpan."),
        (Lang::Id, _) => format!("Penyesuaian {number} disimpan."),
    }
}

pub fn available_hint(lang: Lang, n: i64, unit: &str) -> String {
    match lang { Lang::En => format!("Available: {n} {unit}"), Lang::Id => format!("Tersedia: {n} {unit}") }
}

pub fn reserved_note(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} reserved by approved loans."), Lang::Id => format!("{n} disiapkan untuk peminjaman yang disetujui.") }
}

pub fn stock_detail_title(lang: Lang, number: &str) -> String {
    match lang { Lang::En => format!("Transaction {number}"), Lang::Id => format!("Transaksi {number}") }
}

pub fn void_title(lang: Lang, number: &str) -> String {
    match lang { Lang::En => format!("Void {number}?"), Lang::Id => format!("Batalkan {number}?") }
}

pub fn greater_than_zero(lang: Lang, label: &str) -> String {
    match lang { Lang::En => format!("{label} must be greater than 0."), Lang::Id => format!("{label} harus lebih dari 0.") }
}

pub fn tx_status_label(lang: Lang, status: &str) -> &'static str {
    let s = strings(lang);
    if status == "Voided" { s.status_tx_status_voided } else { s.status_tx_status_posted }
}

pub fn loan_reject_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Reject {n}?"), Lang::Id => format!("Tolak {n}?") }
}

pub fn loan_issue_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Hand over items for {n}?"), Lang::Id => format!("Serahkan barang untuk {n}?") }
}

pub fn loan_return_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Record return for {n}"), Lang::Id => format!("Catat pengembalian {n}") }
}

pub fn loan_cancel_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Cancel {n}?"), Lang::Id => format!("Batalkan {n}?") }
}

pub fn loan_overdue_note(lang: Lang, days: i64) -> String {
    match lang {
        Lang::En => format!("This loan is {days} {} overdue. Ask the borrower to return the items.", plural(lang, days, "day", "days", "")),
        Lang::Id => format!("Peminjaman ini terlambat {days} hari. Minta peminjam mengembalikan barangnya."),
    }
}

pub fn loan_approve_info(lang: Lang, units: i64) -> String {
    match lang {
        Lang::En => format!("Approving reserves the requested quantity ({units} {}). Stock is reduced when you issue the items.", plural(lang, units, "unit", "units", "")),
        Lang::Id => format!("Kalau disetujui, {units} unit yang diminta disiapkan. Stok baru berkurang saat barang diserahkan."),
    }
}

pub fn loan_step_submitted_body(lang: Lang, who: &str, date: &str) -> String {
    match lang { Lang::En => format!("Requested by {who} on {date}."), Lang::Id => format!("Diajukan oleh {who} pada {date}.") }
}

pub fn purchase_reject_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Reject {n}?"), Lang::Id => format!("Tolak {n}?") }
}

pub fn purchase_cancel_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Cancel {n}?"), Lang::Id => format!("Batalkan {n}?") }
}

pub fn purchase_receive_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Record items received for {n}"), Lang::Id => format!("Catat barang datang untuk {n}") }
}

/// The legend of one line in the receive form: "Kabel, 3 pcs".
pub fn purchase_receive_line_name(name: &str, qty: i64, unit: &str) -> String {
    format!("{name}, {qty} {unit}")
}

pub fn purchase_status_label(lang: Lang, status: crate::models::PurchaseStatus) -> &'static str {
    use crate::models::PurchaseStatus::*;
    let s = strings(lang);
    match status {
        Draft => s.status_purchase_draft,
        PendingApproval => s.status_purchase_pending_approval,
        Approved => s.status_purchase_approved,
        Rejected => s.status_purchase_rejected,
        Received => s.status_purchase_received,
        Cancelled => s.status_purchase_cancelled,
    }
}

/// "1 row" / "2 rows" / "3 baris": the row count above a report.
pub fn report_rows(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} {}", plural(lang, n, "row", "rows", "")), Lang::Id => format!("{n} baris") }
}

pub fn backup_created(lang: Lang, name: &str) -> String {
    match lang { Lang::En => format!("Backup {name} created."), Lang::Id => format!("Cadangan {name} dibuat.") }
}

/// "3 of 14" / "3 dari 14".
pub fn backup_kept_value(lang: Lang, n: u32, max: u32) -> String {
    match lang { Lang::En => format!("{n} of {max}"), Lang::Id => format!("{n} dari {max}") }
}

pub fn backup_kept_caption(lang: Lang, n: u32) -> String {
    match lang { Lang::En => format!("The latest {n} are kept; older ones are removed"), Lang::Id => format!("{n} cadangan terbaru disimpan; yang lebih lama dihapus") }
}

/// The kind of a backup file as the server names it (`Automatic`, `Manual`, `Before update`, ...); an unknown kind is shown as it is.
pub fn backup_kind_label(lang: Lang, kind: &str) -> String {
    let s = strings(lang);
    match kind {
        "Automatic" => s.status_backup_kind_automatic,
        "Manual" => s.status_backup_kind_manual,
        "Before update" => s.status_backup_kind_before_update,
        "Before import" => s.status_backup_kind_before_import,
        "Before restore" => s.status_backup_kind_before_restore,
        other => other,
    }
    .to_string()
}

pub fn user_deactivate_title(lang: Lang, n: &str) -> String {
    deactivate_title(lang, n)
}

pub fn user_activate_title(lang: Lang, n: &str) -> String {
    activate_title(lang, n)
}

pub fn user_reset_title(lang: Lang, n: &str) -> String {
    match lang { Lang::En => format!("Reset password for {n}?"), Lang::Id => format!("Reset password {n}?") }
}

pub fn user_temp_body(lang: Lang, n: &str) -> String {
    match lang {
        Lang::En => format!("Give this password to {n} in person. It is shown only once, and they must change it at next sign-in."),
        Lang::Id => format!("Berikan password ini langsung ke {n}. Password hanya ditampilkan sekali, dan harus diganti saat masuk berikutnya."),
    }
}

/// The "Preferred for" count of a supplier: "1 item" / "2 items" / "3 barang".
pub fn supplier_items_count(lang: Lang, n: i64) -> String {
    match lang { Lang::En => format!("{n} {}", plural(lang, n, "item", "items", "")), Lang::Id => format!("{n} barang") }
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
    fn stock_texts_read_like_the_web_app() {
        assert_eq!((stock_more_items(Lang::En, 2).as_str(), stock_more_items(Lang::Id, 2).as_str()), ("+2 more", "+2 lainnya"));
        assert_eq!(stock_saved(Lang::En, "IN", "IN-0001"), "Incoming stock IN-0001 saved.");
        assert_eq!(stock_saved(Lang::Id, "OUT", "OUT-0002"), "Barang keluar OUT-0002 disimpan.");
        assert_eq!(stock_saved(Lang::En, "ADJUSTMENT", "ADJ-1"), "Adjustment ADJ-1 saved.");
        assert_eq!((available_hint(Lang::En, 3, "pcs").as_str(), available_hint(Lang::Id, 3, "pcs").as_str()), ("Available: 3 pcs", "Tersedia: 3 pcs"));
        assert_eq!(void_title(Lang::Id, "IN-1"), "Batalkan IN-1?");
        assert_eq!(greater_than_zero(Lang::Id, "Jumlah"), "Jumlah harus lebih dari 0.");
    }

    #[test]
    fn transaction_status_labels_equal_the_web_apps_labels() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        for (lang, file) in [(Lang::En, "strings.ts"), (Lang::Id, "strings.id.ts")] {
            let src = std::fs::read_to_string(format!("{dir}{file}")).unwrap();
            let web = web_nested(&src, "txStatus");
            for kind in ["Posted", "Voided"] {
                assert_eq!(tx_status_label(lang, kind), web[kind], "{file} {kind}");
            }
        }
    }

    #[test]
    fn loan_texts_read_like_the_web_app() {
        assert_eq!((loan_reject_title(Lang::En, "LN-1").as_str(), loan_reject_title(Lang::Id, "LN-1").as_str()), ("Reject LN-1?", "Tolak LN-1?"));
        assert_eq!(loan_issue_title(Lang::Id, "LN-1"), "Serahkan barang untuk LN-1?");
        assert_eq!(loan_return_title(Lang::En, "LN-1"), "Record return for LN-1");
        assert_eq!(loan_cancel_title(Lang::Id, "LN-1"), "Batalkan LN-1?");
        assert_eq!((loan_overdue_note(Lang::En, 1).as_str(), loan_overdue_note(Lang::En, 3).as_str()), ("This loan is 1 day overdue. Ask the borrower to return the items.", "This loan is 3 days overdue. Ask the borrower to return the items."));
        assert_eq!(loan_overdue_note(Lang::Id, 3), "Peminjaman ini terlambat 3 hari. Minta peminjam mengembalikan barangnya.");
        assert_eq!(loan_approve_info(Lang::En, 1), "Approving reserves the requested quantity (1 unit). Stock is reduced when you issue the items.");
        assert_eq!(loan_step_submitted_body(Lang::Id, "Ani", "01/11/2026"), "Diajukan oleh Ani pada 01/11/2026.");
    }

    #[test]
    fn purchase_texts_and_status_labels_equal_the_web_apps() {
        use crate::models::PurchaseStatus::*;
        assert_eq!((purchase_reject_title(Lang::Id, "PR-1").as_str(), purchase_cancel_title(Lang::En, "PR-1").as_str()), ("Tolak PR-1?", "Cancel PR-1?"));
        assert_eq!(purchase_receive_title(Lang::En, "PR-1"), "Record items received for PR-1");
        assert_eq!(purchase_receive_line_name("Kabel", 3, "pcs"), "Kabel, 3 pcs");
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        for (lang, file) in [(Lang::En, "strings.ts"), (Lang::Id, "strings.id.ts")] {
            let src = std::fs::read_to_string(format!("{dir}{file}")).unwrap();
            let web = web_nested(&src, "purchase");
            for (status, key) in [(Draft, "Draft"), (PendingApproval, "Pending Approval"), (Approved, "Approved"), (Rejected, "Rejected"), (Received, "Received"), (Cancelled, "Cancelled")] {
                assert_eq!(purchase_status_label(lang, status), web[key], "{file} purchase {key}");
            }
        }
    }

    #[test]
    fn report_row_counts_read_like_the_web_app() {
        assert_eq!((report_rows(Lang::En, 1).as_str(), report_rows(Lang::En, 2).as_str(), report_rows(Lang::Id, 3).as_str()), ("1 row", "2 rows", "3 baris"));
    }

    #[test]
    fn backup_and_user_texts_equal_the_web_apps() {
        assert_eq!((backup_created(Lang::En, "a.sql").as_str(), backup_created(Lang::Id, "a.sql").as_str()), ("Backup a.sql created.", "Cadangan a.sql dibuat."));
        assert_eq!((backup_kept_value(Lang::En, 3, 14).as_str(), backup_kept_value(Lang::Id, 3, 14).as_str()), ("3 of 14", "3 dari 14"));
        assert_eq!(backup_kept_caption(Lang::Id, 14), "14 cadangan terbaru disimpan; yang lebih lama dihapus");
        assert_eq!((user_reset_title(Lang::En, "Ani").as_str(), user_reset_title(Lang::Id, "Ani").as_str()), ("Reset password for Ani?", "Reset password Ani?"));
        assert_eq!(user_temp_body(Lang::En, "Ani"), "Give this password to Ani in person. It is shown only once, and they must change it at next sign-in.");
        assert_eq!(backup_kind_label(Lang::En, "Something new"), "Something new");
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/");
        for (lang, file) in [(Lang::En, "strings.ts"), (Lang::Id, "strings.id.ts")] {
            let src = std::fs::read_to_string(format!("{dir}{file}")).unwrap();
            let web = web_nested(&src, "kinds");
            for kind in ["Automatic", "Manual", "Before update", "Before import", "Before restore"] {
                assert_eq!(backup_kind_label(lang, kind), web[kind], "{file} {kind}");
            }
        }
    }

    #[test]
    fn counts_read_naturally() {
        assert_eq!(showing(Lang::En, 1, 8, 17), "Showing 1-8 of 17");
        assert_eq!(showing(Lang::Id, 9, 16, 17), "Menampilkan 9-16 dari 17");
        assert_eq!(showing(Lang::Id, 0, 0, 0), "Tidak ada hasil");
        assert_eq!(page(Lang::En, 2), "Page 2");
        assert_eq!((supplier_items_count(Lang::En, 1).as_str(), supplier_items_count(Lang::En, 2).as_str(), supplier_items_count(Lang::Id, 3).as_str()), ("1 item", "2 items", "3 barang"));
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
            for section in ["app", "nav", "common", "user", "states", "errors", "auth", "fields", "validation", "dashboard", "items", "itemImport", "categories", "subcategories", "suppliers", "stock", "loans", "purchases", "expenses", "reports", "backup", "users", "activity", "profile"] {
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
