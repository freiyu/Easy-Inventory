//! Which pages each role sees in the sidebar. The same list and order as `frontend/src/lib/nav.ts`
//! (a test reads that file and compares). The server still enforces access; this only hides what a role cannot use.

use crate::api::Role;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Page {
    Dashboard,
    Items,
    Categories,
    Suppliers,
    Stock,
    Loans,
    Purchases,
    Expenses,
    Reports,
    Backup,
    Users,
    ActivityLog,
    Profile,
}

/// A sidebar group heading, as a key into the strings (`nav_group_*`). `None` is the group without a heading.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Group {
    Inventory,
    Operations,
    Admin,
}

impl Page {
    /// The path of the same page in the web app (`/items`), used for tests and for logs.
    pub fn href(self) -> &'static str {
        match self {
            Page::Dashboard => "/dashboard",
            Page::Items => "/items",
            Page::Categories => "/categories",
            Page::Suppliers => "/suppliers",
            Page::Stock => "/stock",
            Page::Loans => "/loans",
            Page::Purchases => "/purchases",
            Page::Expenses => "/expenses",
            Page::Reports => "/reports",
            Page::Backup => "/backup",
            Page::Users => "/users",
            Page::ActivityLog => "/activity-log",
            Page::Profile => "/profile",
        }
    }

    /// The Lucide icon of the page, by the name the web app imports (`icon: LayoutDashboard` in `nav.ts`; a test compares).
    pub fn icon(self) -> &'static str {
        match self {
            Page::Dashboard => "LayoutDashboard",
            Page::Items => "Package",
            Page::Categories => "Tags",
            Page::Suppliers => "Truck",
            Page::Stock => "ArrowLeftRight",
            Page::Loans => "HandHelping",
            Page::Purchases => "ShoppingCart",
            Page::Expenses => "Wallet",
            Page::Reports => "FileBarChart",
            Page::Backup => "DatabaseBackup",
            Page::Users => "Users",
            Page::ActivityLog => "ScrollText",
            Page::Profile => "UserRound",
        }
    }

    /// Admin sidebar badges: Items = low + out count, Loans = overdue, Purchases = pending.
    pub fn has_badge(self) -> bool {
        matches!(self, Page::Items | Page::Loans | Page::Purchases)
    }

    fn admin_only(self) -> bool {
        matches!(
            self,
            Page::Categories | Page::Suppliers | Page::Stock | Page::Expenses | Page::Reports | Page::Backup | Page::Users | Page::ActivityLog
        )
    }
}

/// The sidebar group headings are shown to Admin only, like the web sidebar (`showGroupLabels`).
pub fn show_group_labels(role: Role) -> bool {
    role == Role::Admin
}

pub fn can_access(role: Role, page: Page) -> bool {
    role == Role::Admin || !page.admin_only()
}

const GROUPS: &[(Option<Group>, &[Page])] = &[
    (None, &[Page::Dashboard]),
    (Some(Group::Inventory), &[Page::Items, Page::Categories, Page::Suppliers, Page::Stock]),
    (Some(Group::Operations), &[Page::Loans, Page::Purchases, Page::Expenses, Page::Reports]),
    (Some(Group::Admin), &[Page::Backup, Page::Users, Page::ActivityLog, Page::Profile]),
];

/// The sidebar for `role`: groups in order, empty groups dropped.
pub fn sidebar(role: Role) -> Vec<(Option<Group>, Vec<Page>)> {
    GROUPS
        .iter()
        .map(|(g, pages)| (*g, pages.iter().copied().filter(|p| can_access(role, *p)).collect::<Vec<_>>()))
        .filter(|(_, pages)| !pages.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(role: Role) -> Vec<Page> {
        sidebar(role).into_iter().flat_map(|(_, p)| p).collect()
    }

    #[test]
    fn staff_see_only_dashboard_items_loans_purchases_and_profile() {
        assert_eq!(flat(Role::Staff), [Page::Dashboard, Page::Items, Page::Loans, Page::Purchases, Page::Profile]);
    }

    #[test]
    fn admin_sees_every_page_once() {
        let pages = flat(Role::Admin);
        assert_eq!(pages.len(), 13);
        let mut seen = std::collections::HashSet::new();
        assert!(pages.iter().all(|p| seen.insert(*p)));
    }

    #[test]
    fn staff_groups_drop_the_headings_they_have_nothing_in() {
        let groups: Vec<_> = sidebar(Role::Staff).into_iter().map(|(g, _)| g).collect();
        assert_eq!(groups, [None, Some(Group::Inventory), Some(Group::Operations), Some(Group::Admin)]); // Items, Loans/Purchases, Profile
        assert!(!can_access(Role::Staff, Page::Users) && can_access(Role::Admin, Page::Users));
    }

    #[test]
    fn group_headings_are_for_admin_only_and_icons_equal_the_web_apps() {
        assert!(show_group_labels(Role::Admin) && !show_group_labels(Role::Staff));
        let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/nav.ts")).unwrap();
        for page in flat(Role::Admin) {
            let line = ts.lines().find(|l| l.contains(&format!("href: \"{}\"", page.href()))).unwrap_or_else(|| panic!("{} in nav.ts", page.href()));
            assert!(line.contains(&format!("icon: {},", page.icon())), "{:?}: {line}", page);
        }
    }

    /// The web app's nav.ts is the source: same pages, same roles, same order.
    #[test]
    fn matches_the_web_apps_nav_ts() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/nav.ts");
        let ts = std::fs::read_to_string(path).unwrap();
        let mut web: Vec<(String, bool)> = Vec::new(); // (href, staff can use it)
        for line in ts.lines() {
            let Some(i) = line.find("href: \"") else { continue };
            let href = line[i + 7..].split('"').next().unwrap().to_string();
            web.push((href, line.contains("roles: both")));
        }
        assert!(web.len() >= 13, "found {} entries in nav.ts", web.len());
        let ours: Vec<(String, bool)> = flat(Role::Admin).into_iter().map(|p| (p.href().to_string(), can_access(Role::Staff, p))).collect();
        assert_eq!(ours, web);
    }
}
