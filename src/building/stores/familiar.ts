// 萌獸：照遊戲的結構來 —— 一隻萌獸有三條詞條，一次召喚一隻，另外有羈絆欄位。
//
// 早期的模型是「一堆各自有終傷/魔力/物攻的條目」，那是照上游計算機的簡化模型做的，
// 跟遊戲對不上。遊戲實際是：
//   - 召喚萌獸 1 隻，卡片上有三條詞條（可以重複）
//   - 羈絆欄位最多 4 格（含一格 VIP），登錄其他萌獸進去
//   - 下面是整個圖鑑，分 普通／特殊／稀有／罕見／傳說
//
// 終傷怎麼合成：**萌獸之間相加，加完之後才乘進總傷害**。這不是推測，遊戲內
// 「最終傷害」的 tooltip 直接寫著「以萌獸屬性套用的最終傷害彼此之間會進行加總，
// 最後會相乘套用並計算」，而且實測吻合 ——
//
//   藍色緞帶肥肥（稀有）兩條都是最終傷害 +8%
//     → 面板的［套用中的數值］顯示「萌獸：16.00%」（相加），不是 16.64%（相乘）
//     → 面板總最終傷害 286.85% = (1 + 技能 233.49%) × (1 + 萌獸 16%)
//
// 所以 finalDamageSources 收集的是逐條的值，交給 famMultFromSources 相加成一個倍率。
// 魔力%／物攻% 也是加算，但走的是另一條路（公式的 percentAtk），兩者不能混。
//
// 萌獸不隨裝備組切換：五組裝備共用同一批。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { famMultFromSources } from '@/core/familiar'
import { familiarEffect } from '../data/familiarLines'

const STORAGE_KEY = 'mbFamiliarV2'
/** 舊版（一條一個條目、沒有三條詞條的結構） */
const LEGACY_KEY = 'mbFamiliarV1'
const MAX_NAME_LENGTH = 20
/** 遊戲裡每隻萌獸固定三條詞條 */
export const LINES_PER_FAMILIAR = 3
/** 羈絆欄位最多 4 格（一格 VIP） */
export const MAX_BOND_SLOTS = 4

export const FAMILIAR_GRADES = ['普通', '特殊', '稀有', '罕見', '傳說'] as const
export type FamiliarGrade = (typeof FAMILIAR_GRADES)[number]

/** 位置：召喚中／羈絆／沒上場 */
export type FamiliarSlot = 'summon' | 'bond' | null

export interface FamiliarLine {
  /** 詞條名稱，對應 data/familiarLines.ts 的表 */
  name: string
  /**
   * 實際數值，由玩家照遊戲畫面填。
   *
   * 隨萌獸階級不同，而且**羈絆欄位填的是壓縮後的生效值**：登錄進羈絆之後數字會被
   * 壓縮，壓縮規則沒有公開資料。與其猜一個係數，不如讓玩家照面板填 —— 也因此
   * 同一隻在召喚中與羈絆之間搬動時，數值不會自動換算。
   */
  value: number
}

export interface Familiar {
  id: string
  name: string
  grade: FamiliarGrade
  lines: FamiliarLine[]
  slot: FamiliarSlot
}

function createId(): string {
  return `fam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

const num = (value: unknown): number => Number(value) || 0

function emptyLines(): FamiliarLine[] {
  return Array.from({ length: LINES_PER_FAMILIAR }, () => ({ name: '', value: 0 }))
}

function normalize(raw: Partial<Familiar>): Familiar {
  const lines = Array.isArray(raw.lines) ? raw.lines : []
  return {
    id: String(raw.id || createId()),
    name: String(raw.name ?? '').slice(0, MAX_NAME_LENGTH),
    grade: FAMILIAR_GRADES.includes(raw.grade as FamiliarGrade)
      ? (raw.grade as FamiliarGrade)
      : '傳說',
    // 固定三條，缺的補空、多的裁掉 —— 遊戲就是三條
    lines: Array.from({ length: LINES_PER_FAMILIAR }, (_, i) => ({
      name: String(lines[i]?.name ?? ''),
      value: num(lines[i]?.value),
    })),
    slot: raw.slot === 'summon' || raw.slot === 'bond' ? raw.slot : null,
  }
}

/**
 * 舊版存檔轉過來。
 *
 * 舊版一筆就是一個「終傷 N%／魔力 N%／物攻 N%」的組合，對應不到某一隻萌獸，
 * 所以轉成一隻萌獸、把有值的欄位放進它的詞條裡。第一筆當召喚中，其餘當羈絆 ——
 * 寧可轉得保守一點讓玩家自己調，也不要憑空丟掉他填過的數字。
 */
function migrateLegacy(): Familiar[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return (parsed as Array<Record<string, unknown>>)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => {
        const lines: FamiliarLine[] = []
        if (num(entry.finalDamage)) lines.push({ name: '最終傷害%', value: num(entry.finalDamage) })
        if (num(entry.magicPowerPercent)) {
          lines.push({ name: '魔法攻擊力%', value: num(entry.magicPowerPercent) })
        }
        if (num(entry.attackPowerPercent)) {
          lines.push({ name: '物理攻擊力%', value: num(entry.attackPowerPercent) })
        }
        return normalize({
          name: String(entry.label ?? ''),
          lines,
          slot: entry.equipped === false ? null : index === 0 ? 'summon' : 'bond',
        })
      })
  } catch {
    return []
  }
}

function load(): Familiar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return migrateLegacy()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as Partial<Familiar>[]).filter(Boolean).map(normalize)
  } catch {
    return []
  }
}

export interface FamiliarTotals {
  /** 終傷逐條來源（乘算），直接餵給公式的 famFinalSources */
  finalDamageSources: number[]
  finalDamageTotal: number
  multiplier: number
  magicPowerPercent: number
  attackPowerPercent: number
  /** 主副屬性的 %，依職業決定要用哪一個 */
  statPercent: Record<'str' | 'dex' | 'int' | 'luk', number>
  allStatPercent: number
}

/** 一組萌獸的合計。抽出來是為了讓「目前」與「草稿」用同一套算法 */
export function summarize(source: readonly Familiar[]): FamiliarTotals {
  const totals: FamiliarTotals = {
    finalDamageSources: [],
    finalDamageTotal: 0,
    multiplier: 1,
    magicPowerPercent: 0,
    attackPowerPercent: 0,
    statPercent: { str: 0, dex: 0, int: 0, luk: 0 },
    allStatPercent: 0,
  }

  for (const familiar of source) {
    for (const line of familiar.lines) {
      const effect = familiarEffect(line.name, line.value)
      if (!effect) continue
      switch (effect.kind) {
        case 'finalDamage':
          totals.finalDamageSources.push(effect.value)
          break
        case 'attackPercent':
          if (effect.magic) totals.magicPowerPercent += effect.value
          else totals.attackPowerPercent += effect.value
          break
        case 'statPercent':
          totals.statPercent[effect.stat] += effect.value
          break
        case 'allStatPercent':
          totals.allStatPercent += effect.value
          break
      }
    }
  }

  totals.finalDamageTotal = totals.finalDamageSources.reduce((sum, n) => sum + n, 0)
  totals.multiplier = famMultFromSources(totals.finalDamageSources)
  return totals
}

/**
 * 讀草稿裡的位置。
 *
 * 不能寫 `slots[id] ?? familiar.slot`：null 在這裡同時是「沒上場」與「沒有覆寫」，
 * ?? 會把前者當成後者，於是「草稿把某隻撤下來」永遠偵測不到（實際踩過）。
 * 一律用 key 有沒有存在來判斷。
 */
function resolveSlot(slots: Record<string, FamiliarSlot> | null, familiar: Familiar): FamiliarSlot {
  if (!slots || !Object.prototype.hasOwnProperty.call(slots, familiar.id)) return familiar.slot
  return slots[familiar.id]
}
export const useFamiliarStore = defineStore('buildingFamiliar', () => {
  const list = ref<Familiar[]>(load())
  const lastError = ref('')

  /** 草稿：裝備變更頁試算「換一隻會差多少」時用的位置指派（id → slot） */
  const draftSlots = ref<Record<string, FamiliarSlot> | null>(null)

  const summoned = computed(() => list.value.find((f) => f.slot === 'summon') ?? null)
  const bonds = computed(() => list.value.filter((f) => f.slot === 'bond'))
  /** 實際生效的：召喚中 ＋ 羈絆 */
  const active = computed(() => list.value.filter((f) => f.slot !== null))

  const current = computed(() => summarize(active.value))

  const draftActive = computed(() => {
    const slots = draftSlots.value
    if (!slots) return active.value
    return list.value.filter((f) => resolveSlot(slots, f) !== null)
  })
  const draft = computed(() => summarize(draftActive.value))
  const hasDraft = computed(() => {
    const slots = draftSlots.value
    if (!slots) return false
    return list.value.some((f) => resolveSlot(slots, f) !== f.slot)
  })

  function slotOf(id: string): FamiliarSlot {
    const familiar = list.value.find((f) => f.id === id)
    if (!familiar) return null
    return resolveSlot(draftSlots.value, familiar)
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.value))
      lastError.value = ''
    } catch (error) {
      lastError.value = `萌獸儲存失敗：${(error as Error).message}`
    }
  }

  /**
   * 指派位置。召喚中只能有一隻、羈絆最多 4 格 —— 這是遊戲的限制，
   * 讓使用者能違反只會做出一份算不出來的設定。
   */
  function setSlot(id: string, slot: FamiliarSlot): void {
    const target = list.value.find((f) => f.id === id)
    if (!target) return

    if (slot === 'summon') {
      for (const familiar of list.value) {
        if (familiar.slot === 'summon') familiar.slot = null
      }
    }
    if (slot === 'bond' && target.slot !== 'bond' && bonds.value.length >= MAX_BOND_SLOTS) {
      lastError.value = `羈絆欄位最多 ${MAX_BOND_SLOTS} 格，請先把其中一隻撤下來`
      return
    }

    target.slot = slot
    lastError.value = ''
    persist()
  }

  function add(init: Partial<Familiar> = {}): Familiar {
    const familiar = normalize({ lines: emptyLines(), slot: null, ...init })
    list.value.push(familiar)
    persist()
    return familiar
  }

  function update(id: string, patch: Partial<Omit<Familiar, 'id' | 'lines'>>): void {
    const target = list.value.find((f) => f.id === id)
    if (!target) return
    if (patch.name !== undefined) target.name = patch.name.slice(0, MAX_NAME_LENGTH)
    if (patch.grade !== undefined) target.grade = patch.grade
    if (patch.slot !== undefined) setSlot(id, patch.slot)
    else persist()
  }

  function updateLine(id: string, index: number, patch: Partial<FamiliarLine>): void {
    const target = list.value.find((f) => f.id === id)
    const line = target?.lines[index]
    if (!line) return
    if (patch.name !== undefined) line.name = patch.name
    if (patch.value !== undefined) line.value = num(patch.value)
    persist()
  }

  function remove(id: string): void {
    list.value = list.value.filter((f) => f.id !== id)
    if (draftSlots.value) delete draftSlots.value[id]
    persist()
  }

  function clear(): void {
    list.value = []
    draftSlots.value = null
    persist()
  }

  // ── 草稿 ──────────────────────────────────────────
  function startDraft(): void {
    draftSlots.value ??= Object.fromEntries(list.value.map((f) => [f.id, f.slot]))
  }

  function setDraftSlot(id: string, slot: FamiliarSlot): void {
    startDraft()
    const slots = { ...(draftSlots.value ?? {}) }
    if (slot === 'summon') {
      for (const key of Object.keys(slots)) {
        if (slots[key] === 'summon') slots[key] = null
      }
    }
    slots[id] = slot
    draftSlots.value = slots
  }

  function clearDraft(): void {
    draftSlots.value = null
  }

  function applyDraft(): void {
    const slots = draftSlots.value
    if (!slots) return
    for (const familiar of list.value) familiar.slot = resolveSlot(slots, familiar)
    draftSlots.value = null
    persist()
  }

  return {
    list,
    summoned,
    bonds,
    active,
    current,
    draftSlots,
    draftActive,
    draft,
    hasDraft,
    lastError,
    slotOf,
    add,
    update,
    updateLine,
    setSlot,
    remove,
    clear,
    startDraft,
    setDraftSlot,
    clearDraft,
    applyDraft,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFamiliarStore, import.meta.hot))
}
