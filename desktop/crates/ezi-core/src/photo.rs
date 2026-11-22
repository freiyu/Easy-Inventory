//! Checks a photo file before it is sent: type from the file's own bytes, size, not empty.
//! The server checks the same rules again (`backend/src/services/photos.ts`); this gives the message without a round trip.

use crate::api::Lang;
use crate::i18n::strings;

/// 2 MB, as on the server and in the web app (`PHOTO_MAX_BYTES`).
pub const PHOTO_MAX_BYTES: usize = 2 * 1024 * 1024;

/// The content type to upload with, or the message to show.
pub fn check(lang: Lang, bytes: &[u8]) -> Result<&'static str, String> {
    let s = strings(lang);
    if bytes.is_empty() {
        return Err(s.errors_photo_empty.to_string());
    }
    if bytes.len() > PHOTO_MAX_BYTES {
        return Err(s.errors_photo_too_big.to_string());
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok("image/jpeg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Ok("image/png")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Ok("image/webp")
    } else {
        Err(s.errors_photo_type.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_three_types_by_content_and_refuses_the_rest_with_the_web_messages() {
        let mut webp = b"RIFF".to_vec();
        webp.extend([0, 0, 0, 0]);
        webp.extend(b"WEBPxxxx");
        assert_eq!(check(Lang::En, &[0xff, 0xd8, 0xff, 0xe0, 1]), Ok("image/jpeg"));
        assert_eq!(check(Lang::En, &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]), Ok("image/png"));
        assert_eq!(check(Lang::En, &webp), Ok("image/webp"));
        assert_eq!(check(Lang::En, b"<script>.jpg"), Err("The photo must be a JPEG, PNG or WebP image.".into()));
        assert_eq!(check(Lang::Id, b""), Err("Pilih file foto.".into()));
        let mut big = vec![0xff, 0xd8, 0xff];
        big.resize(PHOTO_MAX_BYTES, 0);
        assert!(check(Lang::En, &big).is_ok(), "exactly the limit is fine");
        big.push(0);
        assert_eq!(check(Lang::En, &big), Err("The photo is too large. The limit is 2 MB.".into()));
    }
}
