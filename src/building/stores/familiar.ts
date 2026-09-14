// 萌獸（萌獸卡）：一隻一隻分開存，可以裝備或卸下。
//
// 為什麼是「一隻一隻」而不是一堆詞條：玩家會想比較「換掉這隻會差多少」，
// 那就必須有「這隻」這個單位。早期的模型只有一串詞條，換一隻等於手動改數字，
// 比不出差值。
//
// 為什麼終傷要跟其他詞條分開存：
//   終傷是**乘算**，而且遊戲是以 float32 累加器逐條相加的（見 src/core/familiar.ts）；
//   魔力%／物攻% 則是**加算**，直接進公式的 percentAtk。
//   兩者混在一起遲早會被當成可以相加的同一種東西，那會算錯。
//
// 萌獸不隨裝備組切換：五組裝備共用同一批萌獸，所以不存在裝備組裡。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { famMultFromSources } from '@/core/familiar'

const STORAGE_KEY = 'mbFamiliarV1'
const MAX_LABEL_LENGTH = 20

export interface Familiar {
  id: string
  /** 顯示用名稱，可留空 —— 玩家說過「基底名稱不重要，上面給的數值才是有影響的」 */
  label: string
  /** 最終傷害 %，**乘算** */
  finalDamage: number
  /** 魔法攻擊力 %，加算 */
  magicPowerPercent: number
  /** 攻擊力 %，加算 */
  attackPowerPercent: number
  /** 是否裝備中。卸下的萌獸留著不刪，才能拿來比較 */
  equipped: boolean
}

export type FamiliarInit = Partial<Omit<Familiar, 'id'>>

/**
 * 遊戲裡的標準終傷值：主萌獸每條 20%（超貴萌獸 25%），羈絆每條 2%（最多 4 條）。
 * 20% 與 25% 互斥 —— 整組主萌獸要嘛全 20、要嘛全 25，不會混用。
 * 這裡只提供快速選項，不強制，因為玩家可能遇到我們沒收錄的來源。
 */
export const FAMILIAR_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '主萌獸', value: 20 },
  { label: '主萌獸（超貴）', value: 25 },
  { label: '羈絆', value: 2 },
]

function createId(): string {
  return `fam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

const num = (value: unknown): number => Number(value) || 0

function load(): Familiar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as Familiar[])
      .filter((line) => line && typeof line === 'object')
      .map((line) => ({
        id: String(line.id || createId()),
        label: String(line.label ?? ''),
        finalDamage: num(line.finalDamage),
        magicPowerPercent: num(line.magicPowerPercent),
        attackPowerPercent: num(line.attackPowerPercent),
        // 舊存檔沒有這個欄位，那時候的每一筆都是生效中的
        equipped: line.equipped !== false,
      }))
  } catch {
    return []
  }
}

/** 一組萌獸的合計。抽出來是為了讓「目前」與「草稿」用同一套算法 */
export function summarize(list: readonly Familiar[]) {
  const sources = list.map((f) => f.finalDamage).filter((n) => n !== 0)
  return {
    sources,
    totalPercent: sources.reduce((sum, n) => sum + n, 0),
    multiplier: famMultFromSources(sources),
    magicPowerPercent: list.reduce((sum, f) => sum + f.magicPowerPercent, 0),
    attackPowerPercent: list.reduce((sum, f) => sum + f.attackPowerPercent, 0),
  }
}

export const useFamiliarStore = defineStore('buildingFamiliar', () => {
  const lines = ref<Familiar[]>(load())
  const lastError = ref('')

  /**
   * 草稿：裝備變更頁用來試算「換一隻會差多少」的那一份裝備中清單（id 集合）。
   * null 代表沒有草稿，一切以實際裝備中的為準。
   */
  const draftIds = ref<string[] | null>(null)

  const equipped = computed(() => lines.value.filter((f) => f.equipped))
  const current = computed(() => summarize(equipped.value))

  /** 草稿下的裝備中清單；沒有草稿時等同目前 */
  const draftEquipped = computed(() =>
    draftIds.value === null
      ? equipped.value
      : lines.value.filter((f) => draftIds.value?.includes(f.id)),
  )
  const draft = computed(() => summarize(draftEquipped.value))
  const hasDraft = computed(
    () =>
      draftIds.value !== null &&
      (draftIds.value.length !== equipped.value.length ||
        equipped.value.some((f) => !draftIds.value?.includes(f.id))),
  )

  // 這幾個是給戰鬥力基準用的，一律看「目前裝備中的」
  const sources = computed(() => current.value.sources)
  const totalPercent = computed(() => current.value.totalPercent)
  const multiplier = computed(() => current.value.multiplier)
  const magicPowerPercent = computed(() => current.value.magicPowerPercent)
  const attackPowerPercent = computed(() => current.value.attackPowerPercent)

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines.value))
      lastError.value = ''
    } catch (error) {
      lastError.value = `萌獸儲存失敗：${(error as Error).message}`
    }
  }

  function add(init: FamiliarInit = {}): Familiar {
    const familiar: Familiar = {
      id: createId(),
      label: (init.label ?? '').slice(0, MAX_LABEL_LENGTH),
      finalDamage: num(init.finalDamage),
      magicPowerPercent: num(init.magicPowerPercent),
      attackPowerPercent: num(init.attackPowerPercent),
      equipped: init.equipped !== false,
    }
    lines.value.push(familiar)
    persist()
    return familiar
  }

  function update(id: string, patch: FamiliarInit): void {
    const target = lines.value.find((f) => f.id === id)
    if (!target) return
    if (patch.label !== undefined) target.label = patch.label.slice(0, MAX_LABEL_LENGTH)
    if (patch.finalDamage !== undefined) target.finalDamage = num(patch.finalDamage)
    if (patch.magicPowerPercent !== undefined) {
      target.magicPowerPercent = num(patch.magicPowerPercent)
    }
    if (patch.attackPowerPercent !== undefined) {
      target.attackPowerPercent = num(patch.attackPowerPercent)
    }
    if (patch.equipped !== undefined) target.equipped = patch.equipped
    persist()
  }

  function remove(id: string): void {
    lines.value = lines.value.filter((f) => f.id !== id)
    draftIds.value = draftIds.value?.filter((x) => x !== id) ?? null
    persist()
  }

  function clear(): void {
    lines.value = []
    draftIds.value = null
    persist()
  }

  // ── 草稿 ──────────────────────────────────────────
  function startDraft(): void {
    if (draftIds.value === null) draftIds.value = equipped.value.map((f) => f.id)
  }

  function toggleDraft(id: string): void {
    startDraft()
    const list = draftIds.value ?? []
    draftIds.value = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  function clearDraft(): void {
    draftIds.value = null
  }

  /** 把草稿變成實際裝備中的狀態 */
  function applyDraft(): void {
    if (draftIds.value === null) return
    const wanted = new Set(draftIds.value)
    for (const familiar of lines.value) familiar.equipped = wanted.has(familiar.id)
    draftIds.value = null
    persist()
  }

  return {
    lines,
    equipped,
    current,
    draftIds,
    draftEquipped,
    draft,
    hasDraft,
    sources,
    totalPercent,
    multiplier,
    magicPowerPercent,
    attackPowerPercent,
    lastError,
    add,
    update,
    remove,
    clear,
    startDraft,
    toggleDraft,
    clearDraft,
    applyDraft,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFamiliarStore, import.meta.hot))
}
