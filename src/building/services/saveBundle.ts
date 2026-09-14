// 匯出／匯入時把 MapleBuilding 自己的資料一起帶上。
//
// 上游的存檔只含計算機那些欄位（baseMain、skillAtk…），不含裝備組、戰鬥力基準、
// 萌獸、物品欄、裝備庫。按「儲存」拿到的檔案看起來像完整備份，其實少掉一大半 ——
// 那比沒有備份更危險，因為玩家會以為自己備份過了。
//
// 桌面版平常不需要這個：資料檔（%APPDATA% 或便攜資料夾）本來就自動存全部。
// 這兩個按鈕是用來「搬到另一台」或「換手之前留一份」的。

const PREFIX = 'mb'

/** 我們自己的 localStorage 鍵；一律用前綴判斷，新增 store 時不必回來改這裡 */
export function collectBuildingData(storage: Storage = localStorage): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key || !key.startsWith(PREFIX)) continue
    const value = storage.getItem(key)
    if (value !== null) result[key] = value
  }
  return result
}

/**
 * 寫回 localStorage，回傳是否真的有東西被寫。
 *
 * 刻意**不**清掉現有的 mb 鍵：匯入的檔案可能是舊版、少幾個鍵，
 * 清掉等於拿舊備份把新資料洗掉。要整份換掉的話，先按「清除」再匯入。
 */
export function applyBuildingData(data: unknown, storage: Storage = localStorage): boolean {
  if (!data || typeof data !== 'object') return false

  let applied = false
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') continue
    storage.setItem(key, value)
    applied = true
  }
  return applied
}
