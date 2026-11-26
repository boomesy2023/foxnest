use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};

#[derive(Debug, Serialize)]
pub struct FetchResult {
    pub body: String,
    pub status: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VerifiedFeed {
    body: String,
    fetched_at: u64,
}

/// Feeds whose content was captured from an in-app browser after the user
/// completed an anti-bot challenge (e.g. Cloudflare). Persisted on disk so a
/// restart does not force verification again.
static VERIFIED_CACHE: OnceLock<Mutex<HashMap<String, VerifiedFeed>>> = OnceLock::new();
static VERIFIED_PATH: OnceLock<PathBuf> = OnceLock::new();

const VERIFIED_TTL_SECS: u64 = 12 * 60 * 60;
const CREDENTIAL_SERVICE: &str = "com.ifox.foxnest.feed-tokens";
const TRANSLATION_CREDENTIAL_SERVICE: &str = "com.ifox.foxnest.translation";
const TRANSLATION_CREDENTIAL_USER: &str = "api-key";

fn feed_credential(feed_id: &str) -> Result<Entry, String> {
    if feed_id.is_empty() || feed_id.len() > 256 {
        return Err("invalid feed id".into());
    }
    Entry::new(CREDENTIAL_SERVICE, feed_id)
        .map_err(|error| format!("failed to access system keychain: {error}"))
}

fn remove_feed_credential(entry: &Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete system keychain entry: {error}")),
    }
}

fn require_main_window(window: &Window) -> Result<(), String> {
    if window.label() != "main" {
        return Err("credential access is only available in the main window".into());
    }
    Ok(())
}

#[tauri::command]
fn save_feed_token(window: Window, feed_id: String, token: String) -> Result<(), String> {
    require_main_window(&window)?;
    let entry = feed_credential(&feed_id)?;
    if token.is_empty() {
        return remove_feed_credential(&entry);
    }
    entry
        .set_password(&token)
        .map_err(|error| format!("failed to save system keychain entry: {error}"))
}

#[tauri::command]
fn get_feed_token(window: Window, feed_id: String) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    let entry = feed_credential(&feed_id)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to read system keychain entry: {error}")),
    }
}

#[tauri::command]
fn delete_feed_token(window: Window, feed_id: String) -> Result<(), String> {
    require_main_window(&window)?;
    remove_feed_credential(&feed_credential(&feed_id)?)
}

fn translation_credential() -> Result<Entry, String> {
    Entry::new(TRANSLATION_CREDENTIAL_SERVICE, TRANSLATION_CREDENTIAL_USER)
        .map_err(|error| format!("failed to access system keychain: {error}"))
}

#[tauri::command]
fn save_translation_api_key(window: Window, key: String) -> Result<(), String> {
    require_main_window(&window)?;
    let entry = translation_credential()?;
    if key.trim().is_empty() {
        return remove_feed_credential(&entry);
    }
    entry
        .set_password(key.trim())
        .map_err(|error| format!("failed to save system keychain entry: {error}"))
}

#[tauri::command]
fn get_translation_api_key(window: Window) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    match translation_credential()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to read system keychain entry: {error}")),
    }
}

#[tauri::command]
fn delete_translation_api_key(window: Window) -> Result<(), String> {
    require_main_window(&window)?;
    remove_feed_credential(&translation_credential()?)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn verified_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    dir.join("verified_feeds.json")
}

fn verified_cache(app: &AppHandle) -> &Mutex<HashMap<String, VerifiedFeed>> {
    VERIFIED_CACHE.get_or_init(|| {
        let path = VERIFIED_PATH.get_or_init(|| verified_path(app));
        let loaded = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str::<HashMap<String, VerifiedFeed>>(&text).ok())
            .unwrap_or_default();
        Mutex::new(loaded)
    })
}

fn persist_cache(app: &AppHandle) {
    if let Some(cache) = VERIFIED_CACHE.get() {
        let path = verified_path(app);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(map) = cache.lock() {
            if let Ok(text) = serde_json::to_string_pretty(&*map) {
                let _ = std::fs::write(path, text);
            }
        }
    }
}

/// Fetch a URL from the Rust side to bypass WebView CORS restrictions.
/// Returns a previously verified feed body when available and still fresh.
#[tauri::command]
async fn fetch_url(
    app: AppHandle,
    url: &str,
    headers: Option<HashMap<String, String>>,
    timeout_secs: Option<u64>,
) -> Result<FetchResult, String> {
    if let Some(entry) = verified_cache(&app).lock().unwrap().get(url) {
        if now_secs().saturating_sub(entry.fetched_at) < VERIFIED_TTL_SECS {
            return Ok(FetchResult {
                body: entry.body.clone(),
                status: 200,
            });
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("Foxnest/0.1 (+https://github.com/foxnest-app)")
        .timeout(std::time::Duration::from_secs(timeout_secs.unwrap_or(20)))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let mut request = client.get(url);
    if let Some(map) = headers {
        for (key, value) in map {
            request = request.header(&key, value);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?;

    Ok(FetchResult { body, status })
}

#[tauri::command]
async fn post_json(
    url: &str,
    headers: Option<HashMap<String, String>>,
    body: String,
    timeout_secs: Option<u64>,
) -> Result<FetchResult, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("invalid request URL".into());
    }
    if body.len() > 2_000_000 {
        return Err("request body is too large".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Foxnest/0.1")
        .timeout(std::time::Duration::from_secs(timeout_secs.unwrap_or(60)))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body);
    if let Some(map) = headers {
        for (key, value) in map {
            request = request.header(&key, value);
        }
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status().as_u16();
    let response_body = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;
    Ok(FetchResult {
        body: response_body,
        status,
    })
}

/// Store feed content captured inside the verification WebView.
#[tauri::command]
fn save_verified_feed(app: AppHandle, url: String, body: String) -> Result<(), String> {
    // This command is reachable from a remote origin, so never trust the payload.
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("invalid feed URL".into());
    }
    if body.len() < 100 || body.len() > 5_000_000 {
        return Err("feed content has an unexpected size".into());
    }
    let head = body
        .get(..body.len().min(4096))
        .unwrap_or(&body)
        .to_ascii_lowercase();
    if !head.contains("<rss") && !head.contains("<feed") {
        return Err("captured content is not an RSS/Atom feed".into());
    }
    {
        let mut cache = verified_cache(&app).lock().unwrap();
        cache.insert(
            url,
            VerifiedFeed {
                body,
                fetched_at: now_secs(),
            },
        );
    }
    persist_cache(&app);
    Ok(())
}

/// Remove a verified cache entry so the feed is fetched from the network again.
#[tauri::command]
fn clear_verified_feed(app: AppHandle, url: String) -> Result<(), String> {
    if let Some(cache) = VERIFIED_CACHE.get() {
        cache.lock().unwrap().remove(&url);
    }
    persist_cache(&app);
    Ok(())
}

/// Whether a fresh verified copy exists for this feed URL.
#[tauri::command]
fn is_feed_verified(app: AppHandle, url: String) -> Result<bool, String> {
    let cache = verified_cache(&app).lock().unwrap();
    Ok(cache
        .get(&url)
        .map(|entry| now_secs().saturating_sub(entry.fetched_at) < VERIFIED_TTL_SECS)
        .unwrap_or(false))
}

/// Close the verification window once its captured feed has been consumed.
#[tauri::command]
fn close_verification_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("verification") {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open an in-app browser at the site so the user can complete an anti-bot
/// challenge. On each finished page load a script tries to fetch the feed with
/// the WebView's cookies and, on success, saves it into the verified cache.
#[tauri::command]
async fn open_verification_window(
    app: AppHandle,
    site_url: String,
    feed_url: String,
) -> Result<(), String> {
    // Recreate the window so a fresh page load runs the capture script again.
    if let Some(window) = app.get_webview_window("verification") {
        let _ = window.destroy();
    }

    let parsed = reqwest::Url::parse(&site_url).map_err(|e| format!("invalid site URL: {e}"))?;
    let feed_literal = serde_json::to_string(&feed_url).map_err(|e| e.to_string())?;
    let script = format!(
        r#"(async () => {{
          if (window.__foxnestVerifierRunning) return;
          window.__foxnestVerifierRunning = true;
          const feedUrl = {feed_literal};
          const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
          if (!invoke) return;
          // A Cloudflare challenge may set its clearance cookie shortly after
          // the page reports a finished load, so retry for a while.
          for (let attempt = 0; attempt < 30; attempt += 1) {{
            try {{
              const title = (document.title || "").toLowerCase();
              const blocked = title.includes("just a moment") || title.includes("attention required")
                || title.includes("checking your browser");
              if (!blocked) {{
                const response = await fetch(feedUrl, {{ credentials: "include" }});
                if (response.ok) {{
                  const text = await response.text();
                  if (/<(rss|feed)\b/i.test(text)) {{
                    await invoke("save_verified_feed", {{ url: feedUrl, body: text }});
                    return;
                  }}
                }}
              }}
            }} catch (_) {{}}
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }}
        }})();"#
    );

    WebviewWindowBuilder::new(&app, "verification", WebviewUrl::External(parsed))
        .title("站点验证")
        .inner_size(960.0, 720.0)
        .on_page_load(move |window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = window.eval(&script);
            }
        })
        .build()
        .map_err(|e| format!("failed to open verification window: {e}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            post_json,
            save_verified_feed,
            clear_verified_feed,
            is_feed_verified,
            open_verification_window,
            close_verification_window,
            save_feed_token,
            get_feed_token,
            delete_feed_token,
            save_translation_api_key,
            get_translation_api_key,
            delete_translation_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
