// 角色快照：每次從 NEXON API 擷取就存一份。
//
// 保留策略：自動快照滾動保留最近 5 份，超過就丟掉最舊的。
// 使用者可以「保存」某一份（pinned），被保存的不佔自動額度、也不會被滾掉。

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

const STORAGE_KEY = 'mbCharacterSnapshotsV1'
const MAX_AUTO_SNAPSHOTS = 5
const MAX_LABEL_LENGTH = 20

export interface CharacterSnapshot {
  id: string
  fetchedAt: string
  pinned: boolean
  label: string
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

/**
 * 存檔前剝掉圖片與說明文字。
 * 完整回應約 246KB，剝掉後約 61KB — 5 份約 300KB，localStorage 撐得住。
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

function createId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function load(): CharacterSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CharacterSnapshot[]) : []
  } catch {
    // 存檔毀損時不要讓整個頁面掛掉，當作沒有快照
    return []
  }
}

export const useSnapshotsStore = defineStore('buildingSnapshots', () => {
  const snapshots = ref<CharacterSnapshot[]>(load())
  const activeId = ref<string>(snapshots.value[0]?.id ?? '')
  const lastError = ref('')

  const active = computed(
    () => snapshots.value.find((s) => s.id === activeId.value) ?? snapshots.value[0] ?? null,
  )
  const pinned = computed(() => snapshots.value.filter((s) => s.pinned))
  const autos = computed(() => snapshots.value.filter((s) => !s.pinned))

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.value))
      lastError.value = ''
    } catch (error) {
      // 多半是 localStorage 容量爆掉
      lastError.value = `快照儲存失敗：${(error as Error).message}`
    }
  }

  function add(raw: RawCharacterData): CharacterSnapshot {
    const snapshot: CharacterSnapshot = {
      id: createId(),
      fetchedAt: new Date().toISOString(),
      pinned: false,
      label: '',
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

    snapshots.value.unshift(snapshot)

    // 自動快照只留最近 5 份，pinned 的不算在內也不會被丟掉
    const keep: CharacterSnapshot[] = []
    let autoCount = 0
    for (const item of snapshots.value) {
      if (item.pinned) {
        keep.push(item)
        continue
      }
      if (autoCount < MAX_AUTO_SNAPSHOTS) {
        keep.push(item)
        autoCount += 1
      }
    }
    snapshots.value = keep

    activeId.value = snapshot.id
    persist()
    return snapshot
  }

  function setActive(id: string): void {
    if (snapshots.value.some((s) => s.id === id)) activeId.value = id
  }

  /** 保存：轉為 pinned，不再被自動滾動覆蓋 */
  function pin(id: string, label = ''): void {
    const target = snapshots.value.find((s) => s.id === id)
    if (!target) return
    target.pinned = true
    if (label) target.label = label.slice(0, MAX_LABEL_LENGTH)
    persist()
  }

  function unpin(id: string): void {
    const target = snapshots.value.find((s) => s.id === id)
    if (!target) return
    target.pinned = false
    persist()
  }

  function rename(id: string, label: string): void {
    const target = snapshots.value.find((s) => s.id === id)
    if (!target) return
    target.label = label.slice(0, MAX_LABEL_LENGTH)
    persist()
  }

  function remove(id: string): void {
    snapshots.value = snapshots.value.filter((s) => s.id !== id)
    if (activeId.value === id) activeId.value = snapshots.value[0]?.id ?? ''
    persist()
  }

  return {
    snapshots,
    activeId,
    active,
    pinned,
    autos,
    lastError,
    add,
    setActive,
    pin,
    unpin,
    rename,
    remove,
    MAX_AUTO_SNAPSHOTS,
  }
})
