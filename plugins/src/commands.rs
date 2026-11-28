use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::{FoxnestAudioExt, Result};

#[command]
pub(crate) fn play<R: Runtime>(app: AppHandle<R>, payload: PlayRequest) -> Result<()> {
    app.foxnest_audio().play(payload)
}

#[command]
pub(crate) fn pause<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.foxnest_audio().pause()
}

#[command]
pub(crate) fn resume<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.foxnest_audio().resume()
}

#[command]
pub(crate) fn seek<R: Runtime>(app: AppHandle<R>, payload: SeekRequest) -> Result<()> {
    app.foxnest_audio().seek(payload)
}

#[command]
pub(crate) fn skip<R: Runtime>(app: AppHandle<R>, payload: SkipRequest) -> Result<()> {
    app.foxnest_audio().skip(payload)
}

#[command]
pub(crate) fn set_rate<R: Runtime>(app: AppHandle<R>, payload: RateRequest) -> Result<()> {
    app.foxnest_audio().set_rate(payload)
}

#[command]
pub(crate) fn stop<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.foxnest_audio().stop()
}

#[command]
pub(crate) fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<PlaybackState> {
    app.foxnest_audio().get_state()
}
