//! The three states every data screen goes through while it talks to the server.

use ezi_core::api::ApiError;

pub enum Load<T> {
    Loading,
    Ready(T),
    Failed(ApiError),
}

impl<T> Load<T> {
    pub fn from_result(result: Result<T, ApiError>) -> Self {
        match result {
            Ok(v) => Load::Ready(v),
            Err(e) => Load::Failed(e),
        }
    }
}
