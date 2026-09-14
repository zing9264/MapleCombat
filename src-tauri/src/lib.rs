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

/// 存檔位置。`source` 給 UI 顯示「現在為什麼存在這裡」。
#[derive(serde::Serialize)]
struct DataLocation {
    /// 資料夾
    dir: String,
    /// 實際的檔案路徑
    file: String,
    /// "custom" | "exe" | "appdata"
    source: &'static str,
    /// 這個資料夾現在寫得進去嗎
    writable: bool,
}

/// 記住自訂路徑的小檔案。
///
/// 刻意放在 app data 而不是執行檔旁邊：執行檔旁邊可能唯讀（Program Files），
/// 而「要存去哪」這件事本身必須先讀得到，不能跟著它想指向的地方走。
fn location_override_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("取不到設定目錄：{error}"))?;
    Ok(dir.join("datadir.txt"))
}

fn read_location_override(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let path = location_override_file(app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(std::path::PathBuf::from(trimmed))
    }
}

/// 真的寫一個檔案去測，而不是看權限位元。
///
/// Windows 上「有寫入權限」跟「寫得進去」不是同一回事 —— UAC 虛擬化、
/// 唯讀磁碟、被防毒鎖住的資料夾都會讓權限看起來沒問題卻寫不了。
/// 存檔失敗是靜悄悄的災難，寧可花一次 I/O 確認。
fn dir_writable(dir: &std::path::Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".maplebuilding-write-test");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn exe_dir() -> Option<std::path::PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.to_path_buf())
}

/// 決定存檔資料夾，順序是：自訂路徑 → 執行檔旁邊 → app data。
///
/// 預設存在執行檔旁邊，整個資料夾複製到隨身碟就能帶著走，
/// 也讓「我的資料到底在哪」有一個看得見的答案。
/// 安裝版會落在 Program Files 那種寫不進去的地方，這時才退回 app data ——
/// 靜靜地存檔失敗比存到別處更糟，所以用實際寫檔測試來決定，不是猜。
fn data_dir(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, &'static str), String> {
    use tauri::Manager;

    if let Some(dir) = read_location_override(app) {
        return Ok((dir, "custom"));
    }

    if let Some(dir) = exe_dir() {
        if dir_writable(&dir) {
            return Ok((dir, "exe"));
        }
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("取不到資料目錄：{error}"))?;
    Ok((dir, "appdata"))
}

fn data_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let (dir, _) = data_dir(app)?;
    Ok(dir.join("mapledata.json"))
}

fn describe_location(app: &tauri::AppHandle) -> Result<DataLocation, String> {
    let (dir, source) = data_dir(app)?;
    let file = dir.join("mapledata.json");
    Ok(DataLocation {
        writable: dir_writable(&dir),
        dir: dir.to_string_lossy().into_owned(),
        file: file.to_string_lossy().into_owned(),
        source,
    })
}

/// 現在的存檔位置。
#[tauri::command]
fn get_data_location(app: tauri::AppHandle) -> Result<DataLocation, String> {
    describe_location(&app)
}

/// 換存檔位置；`dir` 傳 None 代表恢復預設。
///
/// 會把現有的檔案搬過去。目標已經有資料時**不覆蓋**，直接報錯 ——
/// 那多半是使用者指到另一份存檔，默默蓋掉會毀掉累積很久的東西。
#[tauri::command]
fn set_data_location(
    app: tauri::AppHandle,
    dir: Option<String>,
) -> Result<DataLocation, String> {
    let current = data_file_path(&app)?;

    let target_dir = match dir.as_deref().map(str::trim) {
        Some(value) if !value.is_empty() => {
            let path = std::path::PathBuf::from(value);
            if !dir_writable(&path) {
                return Err(format!("這個資料夾寫不進去：{}", path.display()));
            }
            Some(path)
        }
        _ => None,
    };

    if let Some(ref path) = target_dir {
        let target = path.join("mapledata.json");
        if target != current {
            if target.exists() {
                return Err(format!(
                    "{} 已經有一份存檔了。請先搬走或改名，避免蓋掉既有資料。",
                    target.display()
                ));
            }
            if current.exists() {
                std::fs::copy(&current, &target)
                    .map_err(|error| format!("搬移存檔失敗：{error}"))?;
                std::fs::remove_file(&current)
                    .map_err(|error| format!("移除舊存檔失敗：{error}"))?;
            }
        }
    }

    let marker = location_override_file(&app)?;
    if let Some(parent) = marker.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("建立設定目錄失敗：{error}"))?;
    }
    match target_dir {
        Some(path) => std::fs::write(&marker, path.to_string_lossy().as_bytes())
            .map_err(|error| format!("記住存檔位置失敗：{error}"))?,
        None => {
            if marker.exists() {
                std::fs::remove_file(&marker)
                    .map_err(|error| format!("清除存檔位置失敗：{error}"))?;
            }
        }
    }

    describe_location(&app)
}

/// 跳資料夾選擇對話框，取消時回傳 None。
#[tauri::command]
async fn pick_data_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(path) = picked else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("無法取得資料夾路徑：{error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
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

/// 讓 WebView2 的設定檔跟著執行檔走。
///
/// 沒有這段的話，WebView2 以「應用程式識別碼」當 key，把 localStorage 放在
/// %LOCALAPPDATA%\tw.maplebuilding.app\EBWebView —— 同一台機器上不管從哪個
/// 資料夾啟動，甚至是全新解壓的一份，讀到的都是同一份 localStorage。
///
/// 實際踩過：全新解壓的空資料夾一開啟就長出 289KB 的 mapledata.json，
/// 因為 initDataFile() 看到「沒有檔案」就拿當下的 localStorage 去建檔，
/// 而那份 localStorage 是別的安裝留下的。
///
/// 便攜版的前提是「一個資料夾一份資料」，所以 webview 的設定檔也得放進來。
/// 寫不進去時就不動它，維持原本的行為（安裝版本來就該共用）。
#[cfg(target_os = "windows")]
fn pin_webview_data_dir() {
    let Some(dir) = exe_dir() else {
        return;
    };
    if !dir_writable(&dir) {
        return;
    }
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.join("webview"));
}

pub fn run() {
    #[cfg(target_os = "windows")]
    pin_webview_data_dir();

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
            write_data_file,
            get_data_location,
            set_data_location,
            pick_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
