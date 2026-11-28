const COMMANDS: &[&str] = &[
  "play",
  "pause",
  "resume",
  "seek",
  "skip",
  "set_rate",
  "stop",
  "get_state",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .build();
}
