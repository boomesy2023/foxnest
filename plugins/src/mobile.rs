use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

// Initializes the Kotlin plugin class. The plugin is only wired into the app
// on Android; iOS deliberately falls back to the unsupported desktop impl.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<FoxnestAudio<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.plugin.foxnest_audio", "FoxnestAudioPlugin")?;
    Ok(FoxnestAudio(handle))
}

/// Access to the foxnest-audio APIs on Android. Each call is forwarded to the
/// Kotlin plugin, which owns the Media3 player and foreground service.
pub struct FoxnestAudio<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> FoxnestAudio<R> {
    pub fn play(&self, payload: PlayRequest) -> crate::Result<()> {
        self.0.run_mobile_plugin("play", payload).map_err(Into::into)
    }

    pub fn pause(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin("pause", ()).map_err(Into::into)
    }

    pub fn resume(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin("resume", ()).map_err(Into::into)
    }

    pub fn seek(&self, payload: SeekRequest) -> crate::Result<()> {
        self.0.run_mobile_plugin("seek", payload).map_err(Into::into)
    }

    pub fn skip(&self, payload: SkipRequest) -> crate::Result<()> {
        self.0.run_mobile_plugin("skip", payload).map_err(Into::into)
    }

    pub fn set_rate(&self, payload: RateRequest) -> crate::Result<()> {
        self
            .0
            .run_mobile_plugin("setRate", payload)
            .map_err(Into::into)
    }

    pub fn stop(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin("stop", ()).map_err(Into::into)
    }

    pub fn get_state(&self) -> crate::Result<PlaybackState> {
        self
            .0
            .run_mobile_plugin("getState", ())
            .map_err(Into::into)
    }
}
