// 裝備組（Set 1~5）：對應遊戲內的裝備 preset。
//
// 遊戲提供三組裝備 preset（打王 / 刷怪 / …），玩家會臨場切換，而 API 永遠只
// 回傳當下穿在身上的那一組。所以這裡用固定槽位讓玩家自己歸檔：
// 在遊戲切到某個 preset → 按該槽位的「同步」→ 資料寫進那個槽。
//
// 操作邏輯刻意比照上游的「狀態 1~5」：固定槽位、可命名、可清除。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  EquipmentItem,
  HexaStatCore,
  HyperStatEntry,
  RawCharacterData,
  StatEntry,
  SymbolItem,
} from '../services/nexonApi'

const STORAGE_KEY = 'mbEquipmentSetsV1'
const MAX_NAME_LENGTH = 12

export const SET_SLOT_IDS = ['set1', 'set2', 'set3', 'set4', 'set5'] as const
export type SetSlotId = (typeof SET_SLOT_IDS)[number]

export interface SetData {
  fetchedAt: string
  characterName: string
  worldName: string
  guildName: string
  job: string
  level: number
  stat: StatEntry[]
  equipment: EquipmentItem[]
  symbols: SymbolItem[]
  hyperStat: HyperStatEntry[]
  hexaStat: HexaStatCore[]
}

export interface EquipmentSet {
  id: SetSlotId
  name: string
  data: SetData | null
}

function defaultName(id: SetSlotId): string {
  return `裝備${SET_SLOT_IDS.indexOf(id) + 1}`
}

function emptySets(): EquipmentSet[] {
  return SET_SLOT_IDS.map((id) => ({ id, name: defaultName(id), data: null }))
}

/**
 * 存檔前剝掉圖片與說明文字。
 * 完整回應約 246KB，剝掉後約 61KB — 5 組約 300KB，localStorage 撐得住。
 */
function slimEquipment(items: EquipmentItem[]): EquipmentItem[] {
  return items.map((item) => {
    const copy = { ...item } as EquipmentItem & Record<string, unknown>
    delete copy.item_icon
    delete copy.item_shape_icon
    delete copy.item_shape_name
    delete copy.item_description
    return copy
  })
}

function toSetData(raw: RawCharacterData): SetData {
  return {
    fetchedAt: new Date().toISOString(),
    characterName: raw.basic.character_name,
    worldName: raw.basic.world_name,
    guildName: raw.basic.character_guild_name ?? '',
    job: raw.basic.character_class,
    level: raw.basic.character_level,
    stat: raw.stat.final_stat,
    equipment: slimEquipment(raw.equipment),
    symbols: raw.symbols,
    hyperStat: raw.hyperStat,
    hexaStat: raw.hexaStat,
  }
}

function load(): EquipmentSet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return emptySets()
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return emptySets()

    // 以固定槽位為準，存檔缺漏的槽用空的補上
    const byId = new Map((parsed as EquipmentSet[]).map((s) => [s.id, s]))
    return SET_SLOT_IDS.map((id) => {
      const saved = byId.get(id)
      return {
        id,
        name: saved?.name || defaultName(id),
        data: saved?.data ?? null,
      }
    })
  } catch {
    // 存檔毀損時不要讓整頁掛掉
    return emptySets()
  }
}

export const useEquipmentSetsStore = defineStore('buildingEquipmentSets', () => {
  const sets = ref<EquipmentSet[]>(load())
  const activeId = ref<SetSlotId>('set1')
  const lastError = ref('')

  const active = computed(() => sets.value.find((s) => s.id === activeId.value) ?? sets.value[0])
  const filledCount = computed(() => sets.value.filter((s) => s.data).length)

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sets.value))
      lastError.value = ''
    } catch (error) {
      // 多半是 localStorage 容量爆掉
      lastError.value = `裝備組儲存失敗：${(error as Error).message}`
    }
  }

  function setActive(id: SetSlotId): void {
    activeId.value = id
  }

  /** 同步：用新擷取的資料覆蓋指定槽位，槽位名稱保留 */
  function syncInto(id: SetSlotId, raw: RawCharacterData): void {
    const target = sets.value.find((s) => s.id === id)
    if (!target) return
    target.data = toSetData(raw)
    activeId.value = id
    persist()
  }

  function rename(id: SetSlotId, name: string): void {
    const target = sets.value.find((s) => s.id === id)
    if (!target) return
    target.name = name.trim().slice(0, MAX_NAME_LENGTH) || defaultName(id)
    persist()
  }

  function clear(id: SetSlotId): void {
    const target = sets.value.find((s) => s.id === id)
    if (!target) return
    target.data = null
    persist()
  }

  /** 取某個槽位的單一能力值，用於同步前後比對 */
  function statOf(id: SetSlotId, statName: string): string {
    const target = sets.value.find((s) => s.id === id)
    return target?.data?.stat.find((s) => s.stat_name === statName)?.stat_value ?? ''
  }

  return {
    sets,
    activeId,
    active,
    filledCount,
    lastError,
    setActive,
    syncInto,
    rename,
    clear,
    statOf,
  }
})
