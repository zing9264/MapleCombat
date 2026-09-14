// 把 API 的萌獸資料轉成本地的萌獸清單。
//
// 為什麼值得一個獨立的純函式：這是「遊戲真實狀態 → 我們的模型」的唯一入口，
// 對錯直接反映在戰鬥力上，而它完全不需要 store 或網路就能驗證。
//
// 這也讓萌獸不用再手動輸入 —— API 的 option_value 是**實際生效的數值**
// （暗黑半人馬是魔攻 14%、終傷 20%），不是詞條表上的滿值。

import { familiarLineFromApi } from '../data/familiarLines'
import { LINES_PER_FAMILIAR, type Familiar, type FamiliarLine } from '../stores/familiar'
import type { FamiliarData, FamiliarEntry } from '../services/nexonApi'

/** 沒登錄羈絆時 API 給的 slot_id */
const NOT_LINKED = 'not link'

/**
 * id 直接用萌獸名稱衍生，不用隨機值。
 *
 * 重新同步時要能認出「這是同一隻」—— 隨機 id 會讓每次同步都變成全新的一批，
 * 位置與玩家的調整全部歸零。名稱在遊戲裡是唯一的，拿來當 id 剛好。
 */
export function familiarIdFor(name: string): string {
  return `api:${name}`
}

function toLines(entry: FamiliarEntry): FamiliarLine[] {
  const lines = (entry.option ?? [])
    .slice()
    .sort((a, b) => (a.option_no ?? 0) - (b.option_no ?? 0))
    .map((option) => ({
      name: familiarLineFromApi(option.option_name ?? ''),
      value: Number(option.option_value ?? 0) || 0,
    }))

  while (lines.length < LINES_PER_FAMILIAR) lines.push({ name: '', value: 0 })
  return lines.slice(0, LINES_PER_FAMILIAR)
}

/**
 * 位置：summoned_flag 決定召喚中，slot_id 決定羈絆。
 *
 * 兩者是分開的欄位，理論上不會同時成立；真的同時成立時以召喚中為準，
 * 因為召喚中只有一格、比較不會是誤讀。
 */
function toSlot(entry: FamiliarEntry): Familiar['slot'] {
  if (entry.summoned_flag === 'true') return 'summon'
  if (entry.slot_id && entry.slot_id !== NOT_LINKED) return 'bond'
  return null
}

/**
 * 只收 registered 的。
 *
 * 沒登錄的萌獸卡片不會生效，收進來只會讓清單多出一堆不影響數值的項目。
 */
export function familiarsFromApi(data: FamiliarData | undefined): Familiar[] {
  const entries = data?.entries ?? []
  const out: Familiar[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const name = entry.familiar_name?.trim()
    if (!name || entry.familiar_state !== 'registered') continue
    const id = familiarIdFor(name)
    if (seen.has(id)) continue
    seen.add(id)

    out.push({
      id,
      name,
      grade: '傳說',
      category: entry.familiar_grade ?? undefined,
      lines: toLines(entry),
      slot: toSlot(entry),
    })
  }

  return out
}
