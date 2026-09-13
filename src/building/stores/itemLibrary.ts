// 裝備庫：所有「基底」裝備的全域集合。
//
// 基底 = 裝備的白底基本數值（API 的 item_base_option），不含星力、卷軸、星火、
// 潛能。製作器會以基底為起點，往上疊加各種強化。
//
// 資料來源：每次同步裝備組時自動收錄，不需要手動輸入。API 的 item_base_option
// 已經包含完整基底定義（含 base_equipment_level），所以玩家同步過的每一件裝備
// 都會自動進庫。庫是全域的 —— 跟裝備組無關，任何一組同步到的基底都能拿去
// 套用在其他組上。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EquipmentItem, ItemOption } from '../services/nexonApi'
import { countSetPieces } from '../data/equipmentSets'
import bundledBases from '../data/itemBases.json'
import { baseScrollSlots } from '../core/scrollSlots'

interface BundledBase {
  name: string
  part: string
  level: number
  base: ItemOption
  scrollSlots: number
  icon?: string
  seen: number
}

/** 爬蟲產出的內建基底（tools/building/crawlBases.mjs），只含道具定義、不含角色資訊 */
function loadBundled(): Record<string, BaseItem> {
  const result: Record<string, BaseItem> = {}
  for (const entry of bundledBases as BundledBase[]) {
    result[entry.name] = {
      name: entry.name,
      part: entry.part,
      level: entry.level,
      base: entry.base,
      sets: Object.keys(countSetPieces([entry.name]).counts),
      scrollSlots: entry.scrollSlots,
      icon: entry.icon,
      source: 'bundled',
      updatedAt: '',
    }
  }
  return result
}

const STORAGE_KEY = 'mbItemLibraryV1'

export interface BaseItem {
  /** 道具名稱，同時是庫裡的唯一鍵 */
  name: string
  part: string
  /** 需求等級（item_base_option.base_equipment_level） */
  level: number
  /** 白底基本數值 */
  base: ItemOption
  /** 所屬套裝（查對照表得到，可能多組） */
  sets: string[]
  /** 卷軸總格數（已扣掉白金鐵鎚加開的部分，見 core/scrollSlots.ts） */
  scrollSlots: number
  /** 道具圖示的 CDN 網址；舊資料可能沒有 */
  icon?: string
  /** bundled = 爬蟲收錄、隨程式發佈的內建基底，不寫進 localStorage */
  source: 'sync' | 'manual' | 'bundled'
  updatedAt: string
}

function load(): Record<string, BaseItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BaseItem>) : {}
  } catch {
    // 存檔毀損時不要讓整頁掛掉
    return {}
  }
}

/** 只保留基底相關欄位，丟掉強化後的數值 */
function toBaseItem(item: EquipmentItem, source: BaseItem['source']): BaseItem {
  const base = (item.item_base_option ?? {}) as ItemOption & { base_equipment_level?: number }
  const { counts } = countSetPieces([item.item_name])
  return {
    name: item.item_name,
    part: item.item_equipment_part,
    level: Number(base.base_equipment_level ?? 0),
    base,
    sets: Object.keys(counts),
    // 扣掉鐵鎚加開的格數，才是這件裝備原本的格數（見 core/scrollSlots.ts）
    scrollSlots: baseScrollSlots(item),
    icon: item.item_icon,
    source,
    updatedAt: new Date().toISOString(),
  }
}

export const useItemLibraryStore = defineStore('buildingItemLibrary', () => {
  // 使用者同步到的基底蓋過內建的（同名時以實際同步資料為準）
  const items = ref<Record<string, BaseItem>>({ ...loadBundled(), ...load() })
  const selectedName = ref('')
  const lastError = ref('')

  const all = computed(() =>
    Object.values(items.value).sort(
      (a, b) => b.level - a.level || a.part.localeCompare(b.part) || a.name.localeCompare(b.name),
    ),
  )
  const parts = computed(() => [...new Set(all.value.map((i) => i.part))].sort())
  const selected = computed(() => (selectedName.value ? items.value[selectedName.value] : null))
  const count = computed(() => all.value.length)

  function persist(): void {
    try {
      // 內建基底隨程式發佈，不需要也不應該寫進 localStorage
      const own = Object.fromEntries(
        Object.entries(items.value).filter(([, item]) => item.source !== 'bundled'),
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(own))
      lastError.value = ''
    } catch (error) {
      lastError.value = `裝備庫儲存失敗：${(error as Error).message}`
    }
  }

  /**
   * 同步時收錄基底。
   * 以名稱為鍵覆蓋 —— 同一件裝備的基底不會變，重複同步只是更新時間戳。
   * 回傳這次新增的件數，讓 UI 能回報「本次新增 N 件基底」。
   */
  function absorb(equipment: readonly EquipmentItem[]): number {
    let added = 0
    for (const item of equipment) {
      if (!item.item_name) continue
      if (!items.value[item.item_name]) added += 1
      items.value[item.item_name] = toBaseItem(item, 'sync')
    }
    if (equipment.length) persist()
    return added
  }

  function select(name: string): void {
    selectedName.value = items.value[name] ? name : ''
  }

  function remove(name: string): void {
    delete items.value[name]
    if (selectedName.value === name) selectedName.value = ''
    persist()
  }

  function clearAll(): void {
    items.value = {}
    selectedName.value = ''
    persist()
  }

  return {
    items,
    all,
    parts,
    count,
    selected,
    selectedName,
    lastError,
    absorb,
    select,
    remove,
    clearAll,
  }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useItemLibraryStore, import.meta.hot))
}
