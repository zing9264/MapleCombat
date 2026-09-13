// 潛能詞條表：查「這個部位、這個等級、這個階級，可能出現哪些詞條」。
//
// 資料由 tools/building/fetchPotentials.mjs 從 maplestorycube.org 抽出（社群整理，
// 非官方數據），存在 potentials.json。這裡只負責把它查成一份可以放進下拉選單的清單。
//
// 為什麼要有這個：製作台原本讓玩家自己打潛能字串，打錯了不會有人發現，
// 而且同一條詞條在不同等級數值不同（INT% 在 151 級以上是 13%、以下是 12%），
// 靠記憶輸入遲早會錯。

import raw from './potentials.json'
import { UNAVAILABLE_LINES } from './potentialExclusions'

export type PotentialSlot = 'main' | 'additional'

/** 潛能階級，由低到高 */
export const POTENTIAL_RANKS = ['rare', 'epic', 'unique', 'legendary'] as const
export type PotentialRank = (typeof POTENTIAL_RANKS)[number]

/**
 * 中文階級名。順序照站方「套用階級」選單，由低到高是 特殊→稀有→罕見→傳說。
 * 別照字面直覺對應 —— 「罕見」是 unique 不是 epic，對錯了整份數值都會差一階。
 * 佐證：同一條 INT% 在 151 級以上，rare 4%／epic 7%／unique 10%／legendary 13%，
 * 而遊戲內標「罕見」的裝備上顯示的是 10%。
 */
export const RANK_LABELS: Record<PotentialRank, string> = {
  rare: '特殊',
  epic: '稀有',
  unique: '罕見',
  legendary: '傳說',
}

interface RawValue {
  minLevel: number
  x: number
  /** 有些詞條帶兩個數字（「被擊中時有{x}%機率無視{y}%傷害」） */
  y?: number
}

interface RawRule {
  id: string
  type: string
  rank: string
  values: RawValue[]
  /** 特定部位用另一組數值；目前只有命運武器（同一條 BOSS 傷害高一階） */
  overrides?: Record<string, RawValue[]>
}

interface RawOption {
  template: string
  /** 技能類詞條沒有對應的數值欄位（例如「可以使用<實用的會心之眼>技能」） */
  field: string | null
  main: RawRule[]
  additional: RawRule[]
}

export interface EquipType {
  name: string
  subcategory: string
  category: string
  features: string[]
  commonLevels: number[]
  isFixedLevel: boolean
}

export interface PotentialLine {
  /** 詞條名稱，例如 INT% */
  name: string
  /** 已套好數值的顯示字串，例如「INT +13%」 */
  text: string
  /** 對應的數值欄位（intR、mad…）；技能類詞條沒有數值，為 null */
  field: string | null
  /** 該等級下的數值 */
  x: number
  /** 第二個數值，只有雙數字的詞條才有 */
  y?: number
}

export const EQUIP_TYPES: readonly EquipType[] = raw.equipTypes as EquipType[]

const BY_SUBCATEGORY = new Map(EQUIP_TYPES.map((t) => [t.subcategory, t]))

const OPTIONS = raw.options as Record<string, RawOption>

/**
 * 適用標記 → 這個部位吃不吃得到。
 *
 * 站方用中文標記而不是部位清單（「只有武器不可」就是這種寫法），所以這層對應
 * 得自己寫。判斷一律走 category／subcategory，不要列舉部位名單 —— 站方之後
 * 新增部位時，列舉式的名單會安靜地漏掉它。
 */
function applies(type: string, equip: EquipType): boolean {
  switch (type) {
    case '共用':
      return true
    case '武器專用':
      return equip.category === 'weapon'
    case '只有武器不可':
      return equip.category !== 'weapon'
    // 這兩組**不能**用 category 判斷：站方的 category 只是選單分組，
    // 肩膀與腰帶掛在 accessory 卻吃防具詞條、胸章與機器心臟掛在 other 也吃防具詞條。
    // 逐一比對過 21 個部位的查詢結果才定出下面這條線。
    case '防具專用':
      return equip.category !== 'weapon' && !TRUE_ACCESSORIES.has(equip.subcategory)
    case '飾品專用':
      return TRUE_ACCESSORIES.has(equip.subcategory)
    case '帽子專用':
      return equip.subcategory === 'hat'
    case '鞋子專用':
      return equip.subcategory === 'shoes'
    case '手套專用':
      return equip.subcategory === 'gloves'
    // 套服同時吃上衣與下衣的詞條
    case '上衣專用':
      return equip.subcategory === 'top' || equip.subcategory === 'overall'
    case '下衣專用':
      return equip.subcategory === 'bottom' || equip.subcategory === 'overall'
    default:
      // 看不懂的標記寧可漏掉也不要亂套，但要讓開發時看得見
      console.warn(`[potentials] 未知的適用標記：${type}`)
      return false
  }
}

/**
 * 只有這五個部位吃「飾品專用」的詞條（楓幣、掉落率、MP 消耗）。
 * 肩膀與腰帶雖然在遊戲裡也算飾品欄，潛能上卻是走防具那組。
 */
const TRUE_ACCESSORIES = new Set(['ring', 'pendant', 'earrings', 'face', 'eye'])

/** 取該等級適用的數值：規則是「不超過裝備等級的最大 minLevel」 */
function valueAt(rule: RawRule, itemLevel: number, subcategory: string): RawValue | null {
  // 命運武器同一條詞條的數值比一般武器高一階（BOSS 傷害 40% → 45%），
  // 忽略 overrides 會讓命運武器整組潛能少算 —— 實測就是靠它才對上站方的清單
  const values = rule.overrides?.[subcategory] ?? rule.values
  let result: RawValue | null = null
  for (const v of values) {
    if (v.minLevel <= itemLevel) result = v
  }
  return result
}

export function equipTypeOf(subcategory: string): EquipType | undefined {
  return BY_SUBCATEGORY.get(subcategory)
}

/** 這個部位有沒有潛能欄；沒有的話製作台不該顯示潛能 UI */
export function hasPotential(subcategory: string, slot: PotentialSlot = 'main'): boolean {
  const feature = slot === 'main' ? 'mainPot' : 'additionalPot'
  return BY_SUBCATEGORY.get(subcategory)?.features.includes(feature) ?? false
}

/**
 * 某部位／等級／階級／主或附加，可能出現的所有詞條。
 *
 * 同一條詞條在同一階級只會有一個規則命中；真的重複時取先出現的，
 * 避免下拉選單出現兩個一模一樣的選項。
 */
export function potentialLines(
  subcategory: string,
  itemLevel: number,
  rank: PotentialRank,
  slot: PotentialSlot = 'main',
): PotentialLine[] {
  const equip = BY_SUBCATEGORY.get(subcategory)
  if (!equip) return []

  const lines: PotentialLine[] = []
  const seen = new Set<string>()
  // 型錄上有、方塊實際抽不到的，見 potentialExclusions.ts
  const unavailable = new Set(UNAVAILABLE_LINES[subcategory] ?? [])

  for (const [name, def] of Object.entries(OPTIONS)) {
    // 同一條詞條在同一階級可能有多條規則（無視傷害 20% 與 40% 是兩條），
    // 所以不能配到一條就 break —— 那會少掉其中一個選項。
    for (const rule of def[slot]) {
      if (rule.rank !== rank || !applies(rule.type, equip)) continue
      const value = valueAt(rule, itemLevel, subcategory)
      if (!value) continue

      const text = def.template
        .replace('{x}', String(value.x))
        .replace('{y}', String(value.y ?? ''))
      if (seen.has(text) || unavailable.has(text)) continue
      seen.add(text)
      lines.push({ name, text, field: def.field, x: value.x, y: value.y })
    }
  }

  return lines
}
