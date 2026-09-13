// 桌面版的資料檔：整台機器共用同一份，不再綁瀏覽器設定檔。
//
// 為什麼需要：localStorage 是綁「瀏覽器設定檔」的。同一台機器上用 Chrome 開、
// 用桌面版開、用另一個瀏覽器開，就是三份互不相干的資料 —— 實際踩過這個坑。
// 桌面版可以寫真正的檔案，所以在 Tauri 底下改以檔案為準。
//
// 瀏覽器版做不到：沙箱不允許網頁讀寫本機檔案。網頁版仍然是 localStorage，
// 跨裝置只能靠工具列的「匯入／儲存」手動搬。
//
// 做法刻意是「檔案 ↔ localStorage 雙向同步」，而不是把所有 store 改成讀檔：
// 上游用 per-key localStorage 存 150 個欄位（src/stores/persist.ts），我們自己的
// store 也各自讀寫 localStorage。要全部改寫成非同步讀檔，等於動遍整個上游，
// 合併時會痛不欲生。改成啟動時把檔案灌進 localStorage、之後變動再寫回檔案，
// 上游程式碼一行都不用改。

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/services/tauri'

/** 快照格式版本；日後格式要改時用它判斷是否需要遷移 */
export const SNAPSHOT_VERSION = 1

export interface DataSnapshot {
  version: number
  savedAt: string
  /** localStorage 的完整內容 */
  keys: Record<string, string>
}

/**
 * 不寫進資料檔的鍵。
 *
 * 目前刻意是空的：使用者要的是「整台機器共用」，排除任何東西都代表某個入口
 * 得重設一次。這也表示 **API Key 會以明文存在這個檔案裡** —— 檔案位於使用者
 * 自己的 app data 目錄，但不應該分享出去或丟進雲端備份。
 * 要改成不同步某個鍵，把它加進這裡即可。
 */
export const EXCLUDED_KEYS: ReadonlySet<string> = new Set<string>()

/** 把 localStorage 整包抓成快照 */
export function snapshotStorage(storage: Storage): DataSnapshot {
  const keys: Record<string, string> = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key === null || EXCLUDED_KEYS.has(key)) continue
    const value = storage.getItem(key)
    if (value !== null) keys[key] = value
  }
  return { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), keys }
}

/**
 * 把快照套回 localStorage，並移除快照裡沒有的鍵。
 *
 * 一定要移除：否則在 A 處刪掉的裝備，換個入口開又會冒出來 —— 使用者會覺得
 * 刪除沒生效。啟動時檔案就是唯一事實來源，localStorage 只是工作副本。
 */
export function applySnapshot(storage: Storage, snapshot: DataSnapshot): void {
  const existing: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key !== null) existing.push(key)
  }

  for (const key of existing) {
    if (!EXCLUDED_KEYS.has(key) && !(key in snapshot.keys)) storage.removeItem(key)
  }
  for (const [key, value] of Object.entries(snapshot.keys)) {
    if (!EXCLUDED_KEYS.has(key)) storage.setItem(key, value)
  }
}

/**
 * 解析資料檔內容。壞掉時回傳 null 而不是丟例外 ——
 * 讀不到就當成沒有檔案、沿用目前 localStorage，總比開不起來好。
 */
export function parseSnapshot(text: string): DataSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    const data = parsed as Partial<DataSnapshot>
    if (typeof data.version !== 'number' || data.version > SNAPSHOT_VERSION) return null
    if (!data.keys || typeof data.keys !== 'object') return null

    const keys: Record<string, string> = {}
    for (const [key, value] of Object.entries(data.keys)) {
      if (typeof value === 'string') keys[key] = value
    }
    return { version: data.version, savedAt: String(data.savedAt ?? ''), keys }
  } catch {
    return null
  }
}

// ── Tauri 端 ────────────────────────────────────────

async function readFile(): Promise<string | null> {
  return invoke<string | null>('read_data_file')
}

async function writeFile(contents: string): Promise<void> {
  await invoke('write_data_file', { contents })
}

let dirty = false
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null

/** 最後一次變動後等這麼久才寫檔，避免連續輸入時每個字都寫一次 */
const FLUSH_DELAY_MS = 800

export let lastError = ''

async function flush(): Promise<void> {
  if (!dirty || flushing) return
  flushing = true
  dirty = false
  try {
    await writeFile(JSON.stringify(snapshotStorage(localStorage), null, 2))
    lastError = ''
  } catch (error) {
    // 寫檔失敗不能讓 app 掛掉；資料還在 localStorage，下次變動會再試一次
    dirty = true
    lastError = `資料檔寫入失敗：${(error as Error).message}`
    console.error(lastError)
  } finally {
    flushing = false
  }
}

function scheduleFlush(): void {
  dirty = true
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => void flush(), FLUSH_DELAY_MS)
}

/**
 * 攔截 localStorage 的寫入來得知「有東西變了」。
 *
 * 為什麼用攔截而不是在每個 store 呼叫存檔：寫入點散落在上游的 persistField
 * 與我們七八個 store 裡，逐一改等於製造一堆上游接縫，而且日後上游新增欄位
 * 就會漏掉。攔截只有一個地方，且不可能漏。
 */
function watchStorage(): void {
  const proto = Storage.prototype
  const original = {
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    clear: proto.clear,
  }

  // 改 Storage.prototype 而不是 localStorage 實例。
  //
  // Storage 有「具名屬性設值器」（localStorage.foo = 'x' 等同 setItem），實例上的
  // 指派與 defineProperty 在部分實作會被攔掉 —— 實測 jsdom 就是如此，兩種都無效；
  // 真實瀏覽器則都可行。原型是普通物件，兩邊都確定生效。
  //
  // sessionStorage 共用同一個原型，所以要用 this 判斷來源，只有 localStorage
  // 的變動才排程寫檔。
  proto.setItem = function (this: Storage, key: string, value: string): void {
    original.setItem.call(this, key, value)
    if (this === localStorage) scheduleFlush()
  }
  proto.removeItem = function (this: Storage, key: string): void {
    original.removeItem.call(this, key)
    if (this === localStorage) scheduleFlush()
  }
  proto.clear = function (this: Storage): void {
    original.clear.call(this)
    if (this === localStorage) scheduleFlush()
  }

  // 關視窗前還有沒寫出去的變動就立刻補寫（此時只能同步觸發，不能 await）
  window.addEventListener('beforeunload', () => {
    if (dirty) void flush()
  })
  // 切到背景時也存一次，當掉時損失比較小
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) void flush()
  })
}

/**
 * 啟動時初始化資料檔。**必須在建立 Pinia store 之前 await** ——
 * store 在建立當下就會讀 localStorage，晚一步就會拿到舊資料。
 *
 * 回傳 true 表示已從檔案覆寫 localStorage，呼叫端應該重新套用
 * 那些在模組載入時就讀過 localStorage 的設定（主題、密度）。
 */
export async function initDataFile(): Promise<boolean> {
  if (!isTauri()) return false

  let replaced = false
  try {
    const text = await readFile()
    const snapshot = text === null ? null : parseSnapshot(text)

    if (snapshot) {
      applySnapshot(localStorage, snapshot)
      replaced = true
    } else {
      // 沒有檔案（全新安裝）或檔案壞掉：用目前 localStorage 的內容建立一份，
      // 這樣舊使用者升級上來時原本的資料會自動被收進檔案，不會憑空消失。
      await writeFile(JSON.stringify(snapshotStorage(localStorage), null, 2))
    }
  } catch (error) {
    lastError = `資料檔讀取失敗：${(error as Error).message}`
    console.error(lastError)
  }

  watchStorage()
  return replaced
}
