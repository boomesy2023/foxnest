use serde::{Deserialize, Serialize};

/// Everything the native player needs to start an episode in one atomic call,
/// so a cold start never plays stale state from a previous session.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayRequest {
    pub id: String,
    pub url: String,
    pub title: String,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub rate: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekRequest {
    pub seconds: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkipRequest {
    pub delta_seconds: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateRequest {
    pub rate: f64,
}

/// Mirror of the frontend `AudioState`. Emitted from Kotlin into the webview
/// via `trigger("state", ...)` and also returned by `get_state` for a snapshot.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub id: String,
    pub current_time: f64,
    pub duration: f64,
    pub paused: bool,
    pub rate: f64,
    pub buffering: bool,
    pub ended: bool,
    pub error: Option<String>,
}
