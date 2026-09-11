// 物品欄：玩家在製作台做出來的自製裝備，全域、跨裝備組共用。
//
// 成品的資料結構刻意跟 API 抓下來的裝備「同形」：白底 base、紫 etc(卷軸)、
// 黃 starforce、藍綠 add(星火)，四層各自獨立 —— 換裝比較引擎不需要區分
// 真實裝備與自製裝備。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ItemOption } from '../services/nexonApi'
import type { NumericOption } from '../core/starforce'
import type { GearForCompare } from '../core/equipmentDelta'

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

/**
 * 基底與卷軸層沿用 API 的底線命名（magic_power），星力與星火層是計算模組
 * 產出的駝峰命名（magicPower）。兩種寫法混在同一件裝備裡，直接用欄位名稱
 * 去讀就會漏 —— 實際發生過：物品欄的魔攻只顯示基底 6，漏了星力的 120。
 * 所以一律經過這裡轉成駝峰再使用。
 */
const SNAKE_TO_CAMEL: Record<string, keyof NumericOption> = {
  str: 'str',
  dex: 'dex',
  int: 'int',
  luk: 'luk',
  max_hp: 'maxHp',
  maxHp: 'maxHp',
  max_mp: 'maxMp',
  maxMp: 'maxMp',
  attack_power: 'attackPower',
  attackPower: 'attackPower',
  magic_power: 'magicPower',
  magicPower: 'magicPower',
  armor: 'armor',
  boss_damage: 'bossDamage',
  bossDamage: 'bossDamage',
  ignore_monster_armor: 'ignoreDefense',
  ignoreDefense: 'ignoreDefense',
  all_stat: 'allStat',
  allStat: 'allStat',
  damage: 'damage',
}

export function normalizeLayer(layer: Record<string, unknown> | undefined): NumericOption {
  const result: NumericOption = {}
  for (const [key, value] of Object.entries(layer ?? {})) {
    const camel = SNAKE_TO_CAMEL[key]
    const num = Number(value ?? 0)
    if (!camel || !num) continue
    result[camel] = (result[camel] ?? 0) + num
  }
  return result
}

/** 轉成換裝比較引擎吃的格式 —— 與 API 抓下來的裝備同形 */
export function toGearForCompare(item: CraftedItem): GearForCompare {
  return {
    name: item.baseName,
    part: item.part,
    base: normalizeLayer(item.base as Record<string, unknown>),
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
