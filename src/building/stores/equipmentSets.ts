// 裝備組（Set 1~5）：對應遊戲內的裝備 preset。
//
// 遊戲提供三組裝備 preset（打王 / 刷怪 / …），玩家會臨場切換，而 API 永遠只
// 回傳當下穿在身上的那一組。所以這裡用固定槽位讓玩家自己歸檔：
// 在遊戲切到某個 preset → 按該槽位的「同步」→ 資料寫進那個槽。
//
// 操作邏輯刻意比照上游的「狀態 1~5」：固定槽位、可命名、可清除。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type {
  EquipmentItem,
  SetEffectEntry,
  PetInfo,
  HexaStatCore,
  HyperStatEntry,
  RawCharacterData,
  StatEntry,
  SymbolItem,
} from '../services/nexonApi'

const STORAGE_KEY = 'mbEquipmentSetsV1'
/**
 * 選中的槽位要記住。不記的話重新整理會跳回 set1 ——
 * 各槽的資料可能差很多（實測同一支角色三次同步差到 45%），
 * 對到錯的快照卻毫無提示，基準就悄悄算錯了。
 */
const ACTIVE_KEY = 'mbActiveSetV1'
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
  /** 套裝效果。件數不可信（見 data/equipmentSets.ts），但各階效果內容是對的 */
  setEffects: SetEffectEntry[]
  /** 寵物與寵物裝備。寵物裝備的數值計入「裝備道具」 */
  pets: PetInfo[]
  symbols: SymbolItem[]
  hyperStat: HyperStatEntry[]
  hexaStat: HexaStatCore[]
}

/**
 * 一筆替換草稿：把某個位置的裝備換成物品欄裡的自製裝備。
 *
 * 刻意用「疊在同步資料上的草稿」而不是直接改寫 data.equipment：
 * 重新同步時官方資料會整包覆蓋，直接改寫的內容會被吃掉，而且改寫之後
 * 就再也算不出「跟原本差多少」。
 */
export interface DraftEntry {
  /** 被換掉的裝備在 data.equipment 裡的位置 */
  index: number
  /** 換上的自製裝備 id；null 代表直接拔掉 */
  itemId: string | null
}

export interface EquipmentSet {
  id: SetSlotId
  name: string
  data: SetData | null
  /** 尚未套用的替換草稿，可同時存在多筆 */
  draft: DraftEntry[]
}

function defaultName(id: SetSlotId): string {
  return `裝備${SET_SLOT_IDS.indexOf(id) + 1}`
}

function emptySets(): EquipmentSet[] {
  return SET_SLOT_IDS.map((id) => ({ id, name: defaultName(id), data: null, draft: [] }))
}

/**
 * 存檔前剝掉圖片與說明文字。
 * 完整回應約 246KB，剝掉說明與外觀圖後約 61KB — 5 組約 300KB，localStorage 撐得住。
 * item_icon 保留：裝備欄格子 UI 要用，29 件也才約 1.8KB。
 */
function slimEquipment(items: EquipmentItem[]): EquipmentItem[] {
  return items.map((item) => {
    const copy = { ...item } as EquipmentItem & Record<string, unknown>
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
    setEffects: raw.setEffects,
    pets: raw.pets ?? [],
    symbols: raw.symbols,
    hyperStat: raw.hyperStat,
    hexaStat: raw.hexaStat,
  }
}

function loadActiveId(): SetSlotId {
  const saved = localStorage.getItem(ACTIVE_KEY)
  return SET_SLOT_IDS.includes(saved as SetSlotId) ? (saved as SetSlotId) : 'set1'
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
        // 舊版存檔沒有這個欄位
        draft: Array.isArray(saved?.draft) ? saved.draft : [],
      }
    })
  } catch {
    // 存檔毀損時不要讓整頁掛掉
    return emptySets()
  }
}

export const useEquipmentSetsStore = defineStore('buildingEquipmentSets', () => {
  const sets = ref<EquipmentSet[]>(load())
  const activeId = ref<SetSlotId>(loadActiveId())

  watch(activeId, (id) => {
    try {
      localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      // 記不住只是回到預設槽位，不值得讓整頁掛掉
    }
  })
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
    // 裝備陣列整個換掉了，草稿記的位置不再對應同一件裝備，只能作廢
    target.draft = []
    activeId.value = id
    persist()
  }

  /** 設定某個位置的替換；itemId 為 null 代表拔掉，傳 undefined 代表取消這筆草稿 */
  function setDraftEntry(id: SetSlotId, index: number, itemId: string | null | undefined): void {
    const target = sets.value.find((s) => s.id === id)
    if (!target) return
    const rest = target.draft.filter((entry) => entry.index !== index)
    target.draft = itemId === undefined ? rest : [...rest, { index, itemId }]
    persist()
  }

  /** 清掉某個槽位的全部草稿，回到同步當下的狀態 */
  function clearDraft(id: SetSlotId): void {
    const target = sets.value.find((s) => s.id === id)
    if (!target) return
    target.draft = []
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
    setDraftEntry,
    clearDraft,
    rename,
    clear,
    statOf,
  }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useEquipmentSetsStore, import.meta.hot))
}
