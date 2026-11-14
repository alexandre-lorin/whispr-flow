use serde::Deserialize;
use std::{env, io::{Read, Write}, os::unix::net::UnixStream, path::PathBuf, thread, time::Duration};

#[derive(Deserialize)] struct Cursor { x: i32, y: i32 }
#[derive(Deserialize)] struct Monitor { x: i32, y: i32, width: i32, height: i32 }

fn socket() -> PathBuf {
    let runtime = env::var("XDG_RUNTIME_DIR").expect("XDG_RUNTIME_DIR absent");
    let signature = env::var("HYPRLAND_INSTANCE_SIGNATURE").expect("HYPRLAND_INSTANCE_SIGNATURE absent");
    PathBuf::from(runtime).join("hypr").join(signature).join(".socket.sock")
}

fn command(path: &PathBuf, value: &str) -> Option<String> {
    let mut stream = UnixStream::connect(path).ok()?;
    stream.write_all(value.as_bytes()).ok()?;
    let mut output = String::new();
    stream.read_to_string(&mut output).ok()?;
    Some(output)
}

fn main() {
    let arguments: Vec<String> = env::args().skip(1).collect();
    let address = arguments.iter().position(|arg| arg == "--address")
        .and_then(|i| arguments.get(i + 1).cloned())
        .or_else(|| arguments.iter().find_map(|arg| arg.strip_prefix("--address=").map(str::to_owned)))
        .expect("--address requis");
    let path = socket();
    let mut monitors: Vec<Monitor> = Vec::new();
    let mut last_monitors = 0u128;
    let mut last = (i32::MIN, i32::MIN);
    let started = std::time::Instant::now();
    loop {
        let now = started.elapsed().as_millis();
        if monitors.is_empty() || now.saturating_sub(last_monitors) > 500 {
            if let Some(json) = command(&path, "j/monitors") { monitors = serde_json::from_str(&json).unwrap_or_default(); }
            last_monitors = now;
        }
        if let Some(json) = command(&path, "j/cursorpos") {
            if let Ok(cursor) = serde_json::from_str::<Cursor>(&json) {
                if (cursor.x, cursor.y) != last {
                    last = (cursor.x, cursor.y);
                    let monitor = monitors.iter().find(|m| cursor.x >= m.x && cursor.x < m.x + m.width && cursor.y >= m.y && cursor.y < m.y + m.height)
                        .or_else(|| monitors.first());
                    if let Some(m) = monitor {
                        let x = (cursor.x + 14).min(m.x + m.width - 168 - 4).max(m.x + 4);
                        let y = (cursor.y + 14).min(m.y + m.height - 36 - 4).max(m.y + 4);
                        let _ = command(&path, &format!("dispatch movewindowpixel exact {x} {y},address:{address}"));
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(4));
    }
}
