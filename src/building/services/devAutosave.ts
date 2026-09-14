// 開發時把 localStorage 備份到開發伺服器，並在資料被清空時自動還原。
//
// 預覽視窗的儲存分割區會在重開機或視窗重開後被換掉，整份資料無聲消失（發生過兩次）。
// 桌面版有資料檔擋著，瀏覽器沒有，所以開發時另外備一份在磁碟上。
//
// 只在 dev 生效：正式版走匯出／匯入與桌面資料檔，不該多一條寫檔路徑。

import { parseSnapshot, snapshotStorage, type DataSnapshot } from './dataFile'

const ENDPOINT = '/__mb-autosave'
/** 存檔節流：資料一變就寫太吵，也沒必要 */
const DEBOUNCE_MS = 3000

/**
 * 資料被判定為「空」的門檻。
 *
 * 不能只看有沒有 mb 開頭的鍵：使用者可能真的只有 API Key。
 * 這裡看的是「有沒有任何一份實質資料」，避免把空白狀態當成正常而覆蓋掉備份。
 */
const SUBSTANTIVE_KEYS = ['mbEquipmentSetsV1', 'mbBaselineV1', 'mbInventoryV1', 'mbFamiliarV1']

function hasSubstantiveData(storage: Storage): boolean {
  return SUBSTANTIVE_KEYS.some((key) => {
    const value = storage.getItem(key)
    return !!value && value !== '[]' && value !== '{}'
  })
}

async function loadBackup(): Promise<DataSnapshot | null> {
  try {
    const text = await fetch(ENDPOINT).then((r) => r.text())
    return parseSnapshot(text)
  } catch {
    return null
  }
}

async function saveBackup(): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshotStorage(localStorage)),
    })
  } catch {
    // 備份失敗不該影響使用；開發伺服器沒開的情況（build preview）就是這樣
  }
}

/**
 * 啟動時：localStorage 空的就從備份還原，回傳 true。
 * **必須在建立 store 之前 await** —— store 在建立當下就會讀 localStorage。
 */
export async function restoreFromBackup(): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  if (hasSubstantiveData(localStorage)) return false

  const snapshot = await loadBackup()
  if (!snapshot) return false

  // 只補、不刪：使用者這次輸入的（例如剛貼上的 API Key）要留著
  for (const [key, value] of Object.entries(snapshot.keys)) {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  }
  console.info('[autosave] localStorage 是空的，已從開發備份還原')
  return true
}

/** 之後持續備份。只在有實質資料時寫，避免用空白狀態蓋掉備份 */
export function watchForBackup(): void {
  if (!import.meta.env.DEV) return

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (hasSubstantiveData(localStorage)) void saveBackup()
    }, DEBOUNCE_MS)
  }

  const proto = Storage.prototype
  const originalSet = proto.setItem
  const originalRemove = proto.removeItem
  proto.setItem = function (this: Storage, key: string, value: string): void {
    originalSet.call(this, key, value)
    if (this === localStorage) schedule()
  }
  proto.removeItem = function (this: Storage, key: string): void {
    originalRemove.call(this, key)
    if (this === localStorage) schedule()
  }

  // 關視窗前再存一次，免得最後 3 秒的輸入掉了
  window.addEventListener('pagehide', () => {
    if (hasSubstantiveData(localStorage)) void saveBackup()
  })
}
