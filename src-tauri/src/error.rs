use serde::Serialize;
use thiserror::Error;

/// 애플리케이션 전역 에러 타입
#[derive(Debug, Error)]
pub enum AppError {
    #[error("API 호출 실패: {0}")]
    ApiError(String),

    #[error("로깅/파싱 오류: {0}")]
    ParseError(String),

    #[error("설정 파일 로드/저장 실패: {0}")]
    ConfigError(String),

    #[error("쿠키/권한 인증 실패: {0}")]
    AuthError(String),

    #[error("내부 스레드 잠금 획득 실패")]
    LockError,

    #[error("시스템 경로 변환 실패")]
    PathError,

    #[error(transparent)]
    IoError(#[from] std::io::Error),

    #[error(transparent)]
    ReqwestError(#[from] reqwest::Error),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
}

/// 클라이언트(Tauri 프론트엔드)로 반환 가능한 직렬화 구조
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type AppResult<T> = Result<T, AppError>;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::ApiError(ref e) => (StatusCode::BAD_GATEWAY, format!("API 오류: {}", e)),
            AppError::ConfigError(ref e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("설정 오류: {}", e),
            ),
            AppError::ParseError(ref e) => (StatusCode::BAD_REQUEST, format!("파싱 오류: {}", e)),
            AppError::AuthError(ref e) => (StatusCode::UNAUTHORIZED, format!("인증 오류: {}", e)),
            AppError::IoError(ref e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("I/O 오류: {}", e),
            ),
            AppError::ReqwestError(ref e) => (StatusCode::BAD_GATEWAY, format!("요청 오류: {}", e)),
            AppError::LockError => (StatusCode::INTERNAL_SERVER_ERROR, "락 오류".to_string()),
            AppError::PathError => (StatusCode::INTERNAL_SERVER_ERROR, "경로 오류".to_string()),
            AppError::Unknown(ref e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("내부 오류: {}", e),
            ),
        };

        log::error!("AppError occurred: {:?}", self);

        let body = Json(serde_json::json!({
            "error": true,
            "message": error_message,
        }));

        (status, body).into_response()
    }
}
