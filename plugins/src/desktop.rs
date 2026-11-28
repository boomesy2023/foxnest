use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

/// On desktop, iOS and the browser there is no native player: the frontend
/// keeps using its HTMLAudioElement engine. Returning an explicit error makes
/// any accidental native call loud instead of silently doing nothing.
pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<FoxnestAudio<R>> {
    Ok(FoxnestAudio(app.clone()))
}

pub struct FoxnestAudio<R: Runtime>(AppHandle<R>);

fn unsupported<T>() -> crate::Result<T> {
    Err(crate::Error::Unsupported)
}

impl<R: Runtime> FoxnestAudio<R> {
    pub fn play(&self, _payload: PlayRequest) -> crate::Result<()> {
        unsupported()
    }
    pub fn pause(&self) -> crate::Result<()> {
        unsupported()
    }
    pub fn resume(&self) -> crate::Result<()> {
        unsupported()
    }
    pub fn seek(&self, _payload: SeekRequest) -> crate::Result<()> {
        unsupported()
    }
    pub fn skip(&self, _payload: SkipRequest) -> crate::Result<()> {
        unsupported()
    }
    pub fn set_rate(&self, _payload: RateRequest) -> crate::Result<()> {
        unsupported()
    }
    pub fn stop(&self) -> crate::Result<()> {
        unsupported()
    }
    pub fn get_state(&self) -> crate::Result<PlaybackState> {
        unsupported()
    }
}
