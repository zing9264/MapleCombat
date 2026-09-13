// 物品欄：玩家在製作台做出來的自製裝備，全域、跨裝備組共用。
//
// 成品的資料結構刻意跟 API 抓下來的裝備「同形」：白底 base、紫 etc(卷軸)、
// 黃 starforce、藍綠 add(星火)，四層各自獨立 —— 換裝比較引擎不需要區分
// 真實裝備與自製裝備。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ItemOption } from '../services/nexonApi'
import type { GearForCompare } from '../core/equipmentDelta'
import { normalizeLayer } from '../core/gearAdapters'

export { normalizeLayer }

const STORAGE_KEY = 'mbInventoryV1'
const MAX_NAME_LENGTH = 20

export interface AppliedScroll {
  scrollId: string
  count: number
}

export interface CraftedItem {
  id: string
  /** 顯示名稱，預設等於基底名稱 */
  name: string
  baseName: string
  part: string
  level: number
  /** 基底的圖示網址；自製裝備沿用基底的圖，不然格子上只會剩一串名字 */
  icon?: string
  sets: string[]
  /** 白：基底 */
  base: ItemOption
  /** 紫：卷軸合計（期望值，可能非整數） */
  etc: Record<string, number>
  /** 黃：星力合計 */
  starforce: Record<string, number>
  /** 藍綠：星火合計 */
  add: Record<string, number>
  scrolls: AppliedScroll[]
  starCount: number
  flameTier: number
  potentials: string[]
  additionalPotentials: string[]
  createdAt: string
}

function load(): CraftedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CraftedItem[]) : []
  } catch {
    return []
  }
}

function createId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** 轉成換裝比較引擎吃的格式 —— 與 API 抓下來的裝備同形 */
export function toGearForCompare(item: CraftedItem): GearForCompare {
  return {
    name: item.baseName,
    part: item.part,
    base: normalizeLayer(item.base),
    starforce: normalizeLayer(item.starforce),
    etc: normalizeLayer(item.etc),
    add: normalizeLayer(item.add),
    potentials: item.potentials.filter(Boolean),
    additionalPotentials: item.additionalPotentials.filter(Boolean),
  }
}

export const useInventoryStore = defineStore('buildingInventory', () => {
  const items = ref<CraftedItem[]>(load())
  const selectedId = ref('')
  const lastError = ref('')

  const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null)
  const count = computed(() => items.value.length)

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
      lastError.value = ''
    } catch (error) {
      lastError.value = `物品欄儲存失敗：${(error as Error).message}`
    }
  }

  function add(item: Omit<CraftedItem, 'id' | 'createdAt'>): CraftedItem {
    const created: CraftedItem = { ...item, id: createId(), createdAt: new Date().toISOString() }
    items.value.unshift(created)
    selectedId.value = created.id
    persist()
    return created
  }

  function rename(id: string, name: string): void {
    const target = items.value.find((i) => i.id === id)
    if (!target) return
    target.name = name.trim().slice(0, MAX_NAME_LENGTH) || target.baseName
    persist()
  }

  function remove(id: string): void {
    items.value = items.value.filter((i) => i.id !== id)
    if (selectedId.value === id) selectedId.value = ''
    persist()
  }

  function select(id: string): void {
    selectedId.value = items.value.some((i) => i.id === id) ? id : ''
  }

  return { items, count, selected, selectedId, lastError, add, rename, remove, select }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInventoryStore, import.meta.hot))
}
