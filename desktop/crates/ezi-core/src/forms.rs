//! Form checks before anything is sent, with the same rules and messages as the web app (`frontend/src/lib/schemas.ts`).
//! The server checks everything again; this only saves a round trip and gives the message at the right field.

use std::collections::BTreeMap;

use crate::api::Lang;
use crate::i18n::{required, strings};

/// Field key to message. An empty map means the form is valid.
pub type Errors = BTreeMap<&'static str, String>;

/// `/^\S+@\S+\.\S+$/`: no spaces, and an `@` followed by a `.` that has something on both sides.
pub fn looks_like_email(s: &str) -> bool {
    if s.is_empty() || s.chars().any(char::is_whitespace) {
        return false;
    }
    s.match_indices('@').any(|(i, _)| {
        let (local, domain) = (&s[..i], &s[i + 1..]);
        !local.is_empty() && domain.char_indices().any(|(j, c)| c == '.' && j > 0 && j + 1 < domain.len())
    })
}

fn password_ok(p: &str) -> bool {
    (8..=200).contains(&p.chars().count())
}

pub fn login(lang: Lang, email: &str, password: &str) -> Errors {
    let s = strings(lang);
    let mut e = Errors::new();
    if email.trim().is_empty() {
        e.insert("email", required(lang, s.fields_email));
    }
    if password.is_empty() {
        e.insert("password", required(lang, s.fields_password));
    }
    e
}

pub fn first_admin(lang: Lang, name: &str, email: &str, password: &str, confirm: &str) -> Errors {
    let s = strings(lang);
    let mut e = Errors::new();
    if name.trim().is_empty() {
        e.insert("name", required(lang, s.fields_full_name));
    }
    if email.trim().is_empty() {
        e.insert("email", required(lang, s.fields_email));
    } else if !looks_like_email(email.trim()) {
        e.insert("email", s.validation_email.to_string());
    }
    new_password(lang, password, confirm, &mut e);
    e
}

/// The new password and its confirmation (the current password is checked by the server).
pub fn change_password(lang: Lang, password: &str, confirm: &str) -> Errors {
    let mut e = Errors::new();
    new_password(lang, password, confirm, &mut e);
    e
}

fn new_password(lang: Lang, password: &str, confirm: &str, e: &mut Errors) {
    let s = strings(lang);
    if !password_ok(password) {
        e.insert("password", s.validation_password_length.to_string());
    } else if password != confirm {
        e.insert("confirm", s.validation_password_match.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_shape_matches_the_web_regex() {
        for ok in ["a@b.co", "admin@test.example", "a.b@c.d.e", "x@y.z", "a@@b.co"] {
            assert!(looks_like_email(ok), "{ok}");
        }
        for bad in ["", "a", "a@b", "@b.co", "a@.co", "a@b.", "a b@c.d", "a@b .c", "a@b.c "] {
            assert!(!looks_like_email(bad), "{bad:?}");
        }
    }

    #[test]
    fn login_needs_an_email_and_a_password_and_nothing_more() {
        assert!(login(Lang::En, "x", "y").is_empty(), "the server decides whether the account exists");
        let e = login(Lang::En, "  ", "");
        assert_eq!(e["email"], "Email is required.");
        assert_eq!(e["password"], "Password is required.");
        assert_eq!(login(Lang::Id, "", "x")["email"], "Email wajib diisi.");
    }

    #[test]
    fn setup_checks_name_email_password_length_and_match() {
        assert!(first_admin(Lang::En, "Admin", "a@b.co", "longenough", "longenough").is_empty());
        let e = first_admin(Lang::En, "", "nope", "short", "short");
        assert_eq!((e["name"].as_str(), e["email"].as_str()), ("Full name is required.", "Enter a valid email address."));
        assert_eq!(e["password"], "Password must be at least 8 characters.");
        assert_eq!(first_admin(Lang::En, "A", "a@b.co", "longenough", "different1")["confirm"], "The passwords do not match.");
        assert_eq!(first_admin(Lang::Id, "A", "a@b.co", "pendek", "pendek")["password"], "Password minimal 8 karakter.");
        assert!(first_admin(Lang::En, "A", "a@b.co", &"x".repeat(201), &"x".repeat(201)).contains_key("password"));
        assert!(first_admin(Lang::En, "A", "a@b.co", &"x".repeat(200), &"x".repeat(200)).is_empty());
    }

    #[test]
    fn change_password_follows_the_same_password_rules() {
        assert!(change_password(Lang::En, "newpass123", "newpass123").is_empty());
        assert!(change_password(Lang::En, "short", "short").contains_key("password"));
        assert!(change_password(Lang::En, "newpass123", "newpass124").contains_key("confirm"));
    }
}
