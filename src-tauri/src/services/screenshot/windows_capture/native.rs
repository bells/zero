use super::{
    display_snapshot, CaptureDisplaySnapshot, DisplayFrame, DisplayIdentity, ScreenshotError,
};
use crate::services::screenshot::{
    cleanup_failed_reveal, close_capture_session_window, screenshot_error, validate_dimensions,
    ScreenshotSessionStore, CAPTURE_WINDOW_LABEL, SCREENSHOT_REVEAL_TIMEOUT,
};
use std::{fs, path::Path};
use tauri::Manager;
use windows::Win32::{
    Foundation::{BOOL, HWND, LPARAM, POINT, RECT},
    Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, EnumDisplayMonitors,
        GdiFlush, GetDC, GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, HMONITOR,
        MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONULL, SRCCOPY,
    },
    UI::{
        HiDpi::{
            GetDpiForMonitor, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT,
            DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, MDT_EFFECTIVE_DPI,
        },
        WindowsAndMessaging::GetCursorPos,
    },
};

struct DpiContext(DPI_AWARENESS_CONTEXT);
impl DpiContext {
    fn enter() -> Result<Self, ScreenshotError> {
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.0 == 0 {
            return Err(screenshot_error(
                "screenshot.monitor",
                "无法读取显示器物理坐标",
                true,
            ));
        }
        Ok(Self(previous))
    }
}
impl Drop for DpiContext {
    fn drop(&mut self) {
        unsafe {
            SetThreadDpiAwarenessContext(self.0);
        }
    }
}

unsafe extern "system" fn collect_monitor(
    monitor: HMONITOR,
    _dc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let monitors = &mut *(data.0 as *mut Vec<HMONITOR>);
    monitors.push(monitor);
    BOOL(1)
}

fn monitors() -> Result<Vec<HMONITOR>, ScreenshotError> {
    let mut monitors = Vec::new();
    let ok = unsafe {
        EnumDisplayMonitors(
            HDC(0),
            None,
            Some(collect_monitor),
            LPARAM(&mut monitors as *mut _ as isize),
        )
    };
    if !ok.as_bool() || monitors.is_empty() {
        return Err(screenshot_error(
            "screenshot.monitor",
            "未找到目标显示器",
            true,
        ));
    }
    Ok(monitors)
}

fn snapshot(monitor: HMONITOR, native_id: u32) -> Result<DisplayIdentity, ScreenshotError> {
    let mut info = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut dpi_x = 0;
    let mut dpi_y = 0;
    unsafe {
        if !GetMonitorInfoW(monitor, &mut info.monitorInfo).as_bool() {
            return Err(screenshot_error(
                "screenshot.monitor_changed",
                "显示器已移除，请重新识别",
                true,
            ));
        }
        GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y)
            .map_err(|_| screenshot_error("screenshot.monitor", "无法读取显示器缩放", true))?;
    }
    let frame = info.monitorInfo.rcMonitor;
    let display = display_snapshot(
        native_id,
        DisplayFrame {
            x: f64::from(frame.left),
            y: f64::from(frame.top),
            width: f64::from(frame.right - frame.left),
            height: f64::from(frame.bottom - frame.top),
        },
        dpi_x,
        dpi_y,
    )?;
    Ok(DisplayIdentity {
        monitor: monitor.0,
        device: info.szDevice,
        display,
        dpi_x,
        dpi_y,
    })
}

fn validate_identity(expected: &DisplayIdentity) -> Result<(), ScreenshotError> {
    let monitor = HMONITOR(expected.monitor);
    if !monitors()?.contains(&monitor)
        || !expected.matches(&snapshot(monitor, expected.display.native_id)?)
    {
        return Err(screenshot_error(
            "screenshot.monitor_changed",
            "入口显示器已移除或布局已变化，请重新识别",
            true,
        ));
    }
    Ok(())
}

// Coordinates from Tauri tray rectangles are physical desktop pixels.
pub(in crate::services::screenshot) fn display_at_point(
    x: f64,
    y: f64,
) -> Result<DisplayIdentity, ScreenshotError> {
    if !x.is_finite()
        || !y.is_finite()
        || x < f64::from(i32::MIN)
        || x > f64::from(i32::MAX)
        || y < f64::from(i32::MIN)
        || y > f64::from(i32::MAX)
    {
        return Err(screenshot_error(
            "screenshot.monitor",
            "入口屏幕坐标无效",
            true,
        ));
    }
    let _dpi = DpiContext::enter()?;
    let target = unsafe {
        MonitorFromPoint(
            POINT {
                x: x.round() as i32,
                y: y.round() as i32,
            },
            MONITOR_DEFAULTTONULL,
        )
    };
    let index = monitors()?
        .iter()
        .position(|monitor| *monitor == target)
        .ok_or_else(|| screenshot_error("screenshot.monitor", "入口显示器已移除", true))?;
    snapshot(target, index as u32 + 1)
}

struct BitmapCapture {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
}
impl Drop for BitmapCapture {
    fn drop(&mut self) {
        unsafe {
            if self.previous.0 != 0 {
                SelectObject(self.memory, self.previous);
            }
            if self.bitmap.0 != 0 {
                let _ = DeleteObject(self.bitmap);
            }
            if self.memory.0 != 0 {
                let _ = DeleteDC(self.memory);
            }
            if self.screen.0 != 0 {
                ReleaseDC(HWND(0), self.screen);
            }
        }
    }
}

fn bitmap(snapshot: &CaptureDisplaySnapshot) -> Result<image::RgbaImage, ScreenshotError> {
    validate_dimensions(snapshot.pixel_width, snapshot.pixel_height)?;
    let frame = &snapshot.physical_frame;
    let mut resources = BitmapCapture {
        screen: HDC(0),
        memory: HDC(0),
        bitmap: HBITMAP(0),
        previous: HGDIOBJ(0),
    };
    unsafe {
        resources.screen = GetDC(HWND(0));
        if resources.screen.0 == 0 {
            return Err(screenshot_error(
                "screenshot.capture_permission",
                "当前桌面不允许屏幕读取",
                true,
            ));
        }
        resources.memory = CreateCompatibleDC(resources.screen);
        if resources.memory.0 == 0 {
            return Err(screenshot_error(
                "screenshot.capture_failed",
                "无法创建截图缓冲区",
                true,
            ));
        }
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: snapshot.pixel_width as i32,
                biHeight: -(snapshot.pixel_height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = std::ptr::null_mut();
        resources.bitmap = CreateDIBSection(
            resources.screen,
            &info,
            DIB_RGB_COLORS,
            &mut pixels,
            None,
            0,
        )
        .map_err(|_| screenshot_error("screenshot.capture_failed", "无法分配截图像素", true))?;
        resources.previous = SelectObject(resources.memory, HGDIOBJ(resources.bitmap.0));
        if pixels.is_null() || resources.previous.0 == 0 || resources.previous.0 == -1 {
            resources.previous = HGDIOBJ(0);
            return Err(screenshot_error(
                "screenshot.capture_failed",
                "截图像素缓冲区不可用",
                true,
            ));
        }
        BitBlt(
            resources.memory,
            0,
            0,
            snapshot.pixel_width as i32,
            snapshot.pixel_height as i32,
            resources.screen,
            frame.x as i32,
            frame.y as i32,
            SRCCOPY | CAPTUREBLT,
        )
        .map_err(|_| {
            screenshot_error(
                "screenshot.capture_permission",
                "当前桌面无法截图，请退出安全桌面后重试",
                true,
            )
        })?;
        if !GdiFlush().as_bool() {
            return Err(screenshot_error(
                "screenshot.capture_failed",
                "截图像素同步失败",
                true,
            ));
        }
        let byte_length = snapshot.pixel_width as usize * snapshot.pixel_height as usize * 4;
        let mut rgba = std::slice::from_raw_parts(pixels.cast::<u8>(), byte_length).to_vec();
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        image::RgbaImage::from_raw(snapshot.pixel_width, snapshot.pixel_height, rgba)
            .ok_or_else(|| screenshot_error("screenshot.capture_failed", "截图像素尺寸无效", false))
    }
}

pub(in crate::services::screenshot) fn capture(
    app: &tauri::AppHandle,
    path: &Path,
    requested_display: Option<DisplayIdentity>,
) -> Result<(u64, CaptureDisplaySnapshot), ScreenshotError> {
    let _dpi = DpiContext::enter()?;
    let identity = if let Some(identity) = requested_display {
        identity
    } else {
        let monitors = monitors()?;
        let mut point = POINT::default();
        unsafe { GetCursorPos(&mut point) }
            .map_err(|_| screenshot_error("screenshot.monitor", "无法读取鼠标所在屏幕", true))?;
        let target = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONULL) };
        let index = monitors
            .iter()
            .position(|monitor| *monitor == target)
            .ok_or_else(|| screenshot_error("screenshot.monitor", "鼠标所在显示器不可用", true))?;
        snapshot(target, index as u32 + 1)?
    };
    validate_identity(&identity)?;
    let image = super::super::startup::measure(app, "snap_startup:native_capture", || {
        bitmap(&identity.display)
    })?;
    validate_identity(&identity)?;
    super::super::startup::measure(app, "snap_startup:png_write", || image.save(path))
        .map_err(|_| screenshot_error("screenshot.capture_write", "无法保存临时截图", true))?;
    let length = fs::metadata(path)
        .map_err(|_| screenshot_error("screenshot.capture_missing", "临时截图不可用", true))?
        .len();
    if length == 0 || length > super::super::MAX_SCREENSHOT_PNG_BYTES as u64 {
        return Err(screenshot_error(
            "screenshot.capture_size",
            "截图文件大小超出允许范围",
            false,
        ));
    }
    Ok((length, identity.display))
}

pub(in crate::services::screenshot) fn open_capture_window(
    app: &tauri::AppHandle,
    session_id: &str,
    display: &CaptureDisplaySnapshot,
) -> Result<(), ScreenshotError> {
    let frame = &display.physical_frame;
    let window = tauri::WebviewWindowBuilder::new(
        app,
        CAPTURE_WINDOW_LABEL,
        tauri::WebviewUrl::App("".into()),
    )
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(false)
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|_| screenshot_error("screenshot.capture_window", "无法打开文字识别选区", true))?;
    *app.state::<ScreenshotSessionStore>()
        .window_owner
        .lock()
        .map_err(|_| screenshot_error("screenshot.lifecycle", "窗口状态不可用", true))? =
        Some(session_id.into());
    let cleanup_app = app.clone();
    let cleanup_id = session_id.to_owned();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let store = cleanup_app.state::<ScreenshotSessionStore>();
            let active = store.active().filter(|session| session.id == cleanup_id);
            store.clear_active_if(&cleanup_id);
            if let Ok(mut owner) = store.window_owner.lock() {
                if owner.as_deref() == Some(&cleanup_id) {
                    *owner = None;
                }
            }
            if let Some(active) = active {
                super::super::restore_shell_window(
                    &cleanup_app,
                    active.restore_window_label.as_deref(),
                );
            }
        }
    });
    let placement = window
        .set_position(tauri::PhysicalPosition::new(frame.x as i32, frame.y as i32))
        .and_then(|_| {
            window.set_size(tauri::PhysicalSize::new(
                display.pixel_width,
                display.pixel_height,
            ))
        })
        .and_then(|_| {
            window.set_position(tauri::PhysicalPosition::new(frame.x as i32, frame.y as i32))
        });
    if placement.is_err() {
        let _ = close_capture_session_window(app, session_id);
        return Err(screenshot_error(
            "screenshot.capture_show",
            "无法定位文字识别选区",
            true,
        ));
    }
    let timeout_app = app.clone();
    let timeout_id = session_id.to_owned();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SCREENSHOT_REVEAL_TIMEOUT).await;
        if timeout_app
            .state::<ScreenshotSessionStore>()
            .is_awaiting_reveal(&timeout_id)
        {
            cleanup_failed_reveal(&timeout_app, &timeout_id);
        }
    });
    Ok(())
}
