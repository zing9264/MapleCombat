use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
fn suppress_native_window_border(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;

    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            attribute: u32,
            value: *const c_void,
            value_size: u32,
        ) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_BORDER_COLOR,
            (&DWMWA_COLOR_NONE as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
    }
}

/// 與上游 MapleCombat 相同的契約：跳出另存新檔對話框，
/// 使用者取消時回傳 Ok(false)，成功寫入回傳 Ok(true)。
#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    default_file_name: String,
    contents: String,
) -> Result<bool, String> {
    // async command 在 async runtime 執行緒上跑，blocking 對話框不會卡住主執行緒
    let picked = app
        .dialog()
        .file()
        .add_filter("JSON 檔案", &["json"])
        .set_file_name(&default_file_name)
        .blocking_save_file();

    let Some(path) = picked else {
        return Ok(false);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("無法取得儲存路徑：{error}"))?;
    std::fs::write(&path, contents).map_err(|error| format!("寫入檔案失敗：{error}"))?;
    Ok(true)
}

/// 便攜模式的資料夾：執行檔旁邊有 portable.txt 就用同一個資料夾存資料。
///
/// 為什麼用標記檔而不是「一律存在執行檔旁邊」：安裝版會被放進 Program Files，
/// 那裡一般使用者沒有寫入權限，靜靜地存檔失敗比存到別處更糟。
/// 有標記才切換，安裝版與便攜版可以用同一個執行檔。
fn portable_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    if dir.join("portable.txt").exists() {
        Some(dir.to_path_buf())
    } else {
        None
    }
}

/// 整台機器共用的資料檔位置：使用者的 app data 目錄。
///
/// 用這裡而不是安裝目錄：安裝目錄在 Program Files 底下通常沒有寫入權限，
/// 而且重新安裝／升級會被覆蓋。app data 目錄跟著使用者帳號走，升級不受影響。
///
/// 便攜模式例外 —— 見 portable_dir()。
fn data_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;

    if let Some(dir) = portable_dir() {
        return Ok(dir.join("mapledata.json"));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("取不到資料目錄：{error}"))?;
    Ok(dir.join("mapledata.json"))
}
/// 讀取資料檔。檔案不存在時回傳 Ok(None)，那是全新安裝的正常狀況，不是錯誤。
#[tauri::command]
fn read_data_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_file_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("讀取資料檔失敗：{error}")),
    }
}

/// 寫入資料檔。
///
/// 先寫暫存檔再 rename：寫到一半當掉或斷電時，原本那份仍然完整。
/// 直接覆寫的話會留下半截 JSON，等於存檔整個毀掉 —— 這是玩家累積很久的資料，
/// 不能冒這個險。
#[tauri::command]
fn write_data_file(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("建立資料目錄失敗：{error}"))?;
    }

    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, contents).map_err(|error| format!("寫入資料檔失敗：{error}"))?;
    std::fs::rename(&temp, &path).map_err(|error| format!("置換資料檔失敗：{error}"))?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;

                if let Some(window) = app.get_webview_window("main") {
                    if let Some(icon) = app.default_window_icon().cloned() {
                        window.set_icon(icon)?;
                    }
                    suppress_native_window_border(&window);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_export_file,
            read_data_file,
            write_data_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
