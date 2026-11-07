"""Compile the production Windows adapters with the exact locked COM versions.

This is binding/source evidence only. Tauri scheduling is a compile-only shim;
this does not launch a WebView, validate an installed runtime, or print a PDF.
The temporary probe has its own target directory and never prepares fixtures.
"""
from pathlib import Path
import json
import shutil
import subprocess
import tempfile
import sys

font_tests = "--font-tests" in sys.argv
root = Path(__file__).resolve().parents[4]
probe = Path(tempfile.mkdtemp(prefix="zero-native-bindings-"))
(probe / "src").mkdir()
(probe / "Cargo.toml").write_text('''[package]
name = "zero-native-bindings-probe"
version = "0.1.0"
edition = "2021"
[dependencies]
quick-xml = "=0.39.2"
zip = { version = "=8.6.0", default-features = false, features = ["deflate-flate2"] }
flate2 = "=1.1.9"
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.149"
[target.'cfg(windows)'.dependencies]
getrandom = "=0.3.4"
webview2-com = "=0.38.2"
windows-core-webview = { package = "windows-core", version = "=0.61.2" }
windows = { version = "=0.52.0", features = ["Win32_Foundation", "Win32_Graphics_DirectWrite"] }
''')
shutil.copyfile(root / "src-tauri/Cargo.lock", probe / "Cargo.lock")
scaffold = r'''#![allow(dead_code)]
extern crate self as tauri;
pub struct AppHandle;
pub struct WebviewWindow;
pub struct PlatformWebview;
pub trait Manager { fn get_webview_window(&self, label: &str) -> Option<WebviewWindow>; }
impl Manager for AppHandle { fn get_webview_window(&self, _: &str) -> Option<WebviewWindow> { unimplemented!("compile only") } }
impl WebviewWindow {
    pub fn with_webview<F: FnOnce(PlatformWebview) + Send + 'static>(&self, _: F) -> Result<(), ()> { unimplemented!("compile only") }
}
impl PlatformWebview {
    pub fn controller(&self) -> webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller { unimplemented!("compile only") }
    pub fn environment(&self) -> webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment { unimplemented!("compile only") }
}
mod engine_bridge {
    pub const FILE_ENGINE_LABEL: &str = "file-engine";
    #[derive(Clone)] pub struct FileEnginePageRect { pub x: f64, pub y: f64, pub width: f64, pub height: f64 }
}
'''
if font_tests:
    scaffold = "#![allow(dead_code)]\n"
for module in (["contracts", "quality", "fonts"] if font_tests else ["contracts", "quality", "fonts", "native_print"]):
    scaffold += f'#[path = {json.dumps(str(root / "src-tauri/src/services/file" / (module + ".rs")))}]\nmod {module};\n'
(probe / "src/lib.rs").write_text(scaffold)
# The first metadata resolution prunes a copied application lockfile to this
# probe. Its exact dependencies are pinned; the second check uses that lock.
base = ["cargo", "test", "--offline", "--lib"] if font_tests else ["cargo", "check", "--offline", "--target", "x86_64-pc-windows-msvc", "--lib"]
commands = [base, [*base, "--locked"]]
print(f"Probe directory: {probe}", flush=True)
for command in commands:
    print(" ".join(command), flush=True)
    subprocess.run(command, cwd=probe, check=True)
