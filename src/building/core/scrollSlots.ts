// 還原裝備「原本」有幾個卷軸格。
//
// 為什麼不能直接用 scroll_upgrade + scroll_upgradeable_count：
// 那是**當下**的總格數，白金鐵鎚加開過的次數也算在裡面。裝備庫的格數是爬蟲從
// 別人身上那件抓的，對方敲過幾次鎚子就會直接反映進去 —— 實際收錄到同一階的
// 永恆手套有 8／11／12／13 四種格數，就是這個原因。
//
// scroll_resilience_count 在實測資料裡是**負數**（敲過 3 次的裝備是 -3），
// 剛好就是鐵鎚加開的量，把它加回去就還原成原始格數。沒敲過的裝備是 0，不影響。
//
// 注意：這個欄位的語意是從玩家自己的裝備反推的，不是官方文件寫的。
// 所以 baseScrollSlots 只在它是負數時才採用；正數視為未知而忽略，
// 寧可沿用當下格數也不要憑一個沒把握的解讀去改數字。

export interface ScrollSlotSource {
  scroll_upgrade?: string | number
  scroll_upgradeable_count?: string | number
  scroll_resilience_count?: string | number
}

const num = (value: string | number | undefined): number => Number(value ?? 0) || 0

/** 當下的總格數（含鐵鎚加開的） */
export function currentScrollSlots(item: ScrollSlotSource): number {
  return num(item.scroll_upgrade) + num(item.scroll_upgradeable_count)
}

/** 鐵鎚加開了幾格；無法判斷時回 0 */
export function hammeredSlots(item: ScrollSlotSource): number {
  const resilience = num(item.scroll_resilience_count)
  return resilience < 0 ? -resilience : 0
}

/** 扣掉鐵鎚後的原始格數 */
export function baseScrollSlots(item: ScrollSlotSource): number {
  return Math.max(0, currentScrollSlots(item) - hammeredSlots(item))
}
