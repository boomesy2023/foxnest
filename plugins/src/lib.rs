use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

// The native implementation exists only on Android. Everywhere else (desktop,
// iOS, browser) the plugin is registered but every call returns Unsupported,
// so the frontend adapter stays a single code path.
#[cfg(target_os = "android")]
mod mobile;
#[cfg(not(target_os = "android"))]
mod desktop;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(target_os = "android")]
use mobile::FoxnestAudio;
#[cfg(not(target_os = "android"))]
use desktop::FoxnestAudio;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to
/// access the foxnest-audio APIs.
pub trait FoxnestAudioExt<R: Runtime> {
    fn foxnest_audio(&self) -> &FoxnestAudio<R>;
}

impl<R: Runtime, T: Manager<R>> crate::FoxnestAudioExt<R> for T {
    fn foxnest_audio(&self) -> &FoxnestAudio<R> {
        self.state::<FoxnestAudio<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("foxnest-audio")
        .invoke_handler(tauri::generate_handler![
            commands::play,
            commands::pause,
            commands::resume,
            commands::seek,
            commands::skip,
            commands::set_rate,
            commands::stop,
            commands::get_state,
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let foxnest_audio = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let foxnest_audio = desktop::init(app, api)?;
            app.manage(foxnest_audio);
            Ok(())
        })
        .build()
}
