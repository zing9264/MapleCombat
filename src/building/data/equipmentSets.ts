// 套裝成員對照表。
//
// 為什麼需要這張表：NEXON API 的 `set_effect.total_set_count` **兩個方向都會錯**，
// 實測與遊戲內套裝視窗比對的結果：
//
//   航海師套裝   API 3 → 實際 4   創世長杖以「幸運道具」身分計入，API 沒算
//   永恆套裝     API 2 → 實際 3   創世長杖本身是永恆套裝武器，API 沒算
//   神祕冥界套裝 API 3 → 實際 2   API 多算
//   小小時光音樂會套組 API 3 → 實際 2   API 多算
//
// 由於件數決定哪幾階效果生效，件數錯 = 能力值加總錯。因此件數必須由實際
// 裝備反推，不能採用 API 的數字。各階「效果內容」則可以信任 API。
//
// 資料來源：遊戲內套裝效果視窗。目前只涵蓋已驗證過的套裝，未列出的套裝
// 會退回使用 API 件數（並由呼叫端標記為未驗證）。

/** 一件裝備屬於哪些套裝。同一件可以同時計入多組（例如創世武器）。 */
export interface SetMembership {
  /** `item_equipment` 的 `item_name` */
  itemName: string
  setNames: string[]
  /** 資料來源，見 SET_MEMBERSHIPS 的說明 */
  source?: 'observed' | 'inferred' | 'manual'
}

/**
 * 創世／命運武器同時屬於永恆套裝，又能以「幸運道具」身分計入另一組套裝。
 * 這是 API 件數出錯的主因，必須特別處理。
 */
export const LUCKY_ITEM_NAMES: ReadonlySet<string> = new Set(['創世長杖', '命運長杖'])

/**
 * 道具 → 所屬套裝的對照資料庫。
 *
 * 內容由 tools/building/crawlBases.mjs 維護，來源分三種：
 *   observed — 由該角色的 set-effect 直接觀察到，最可信
 *   inferred — 尚未被觀察到，暫時以道具名稱與部位推論（會被 observed 覆蓋）
 *   manual   — 觀察法抓不到的：不分職業的套裝（頂級培羅德、漆黑BOSS、死後世界）
 *              以及創世／命運武器（名稱不以系列名開頭）
 */
export const SET_MEMBERSHIPS: readonly SetMembership[] = setMembershipData as SetMembership[]

const BY_ITEM_NAME = new Map<string, string[]>(SET_MEMBERSHIPS.map((m) => [m.itemName, m.setNames]))

export interface SetCountResult {
  counts: Record<string, number>
  /** 對照表裡查不到的裝備名稱，UI 應提示這些可能導致套裝件數低估 */
  unknownItems: string[]
}

/**
 * 從實際穿戴的裝備反推每組套裝的件數。
 *
 * 刻意回報查不到的裝備而不是靜默略過 —— 少算一件就可能少掉一整階套裝效果，
 * 那是幾十點能力值的差距，不能讓它無聲發生。
 */
export function countSetPieces(itemNames: readonly string[]): SetCountResult {
  const counts: Record<string, number> = {}
  const unknownItems: string[] = []

  for (const name of itemNames) {
    const sets = BY_ITEM_NAME.get(name)
    if (!sets) {
      unknownItems.push(name)
      continue
    }
    for (const setName of sets) counts[setName] = (counts[setName] ?? 0) + 1
  }

  return { counts, unknownItems }
}

// ── 套裝各階效果 ────────────────────────────────────
//
// 為什麼不能只用 API：`set-effect` 端點只回傳「已達成」的階層，而它的
// total_set_count 是錯的。實測永恆套裝實際 3 件，API 說 2 件，於是第 3 階的
// 效果內容也一併沒回傳 —— 件數與效果內容一起遺失。
//
// 因此改為自建表，資料取自遊戲內套裝效果視窗。未收錄的套裝會退回使用 API 資料。
//
// 刻意用結構化欄位而非原始字串：遊戲寫「攻擊力/魔力 +20」是一條顯示兩種數值，
// 交給文字解析器會誤判。

import type { StatKey } from '../core/optionParser'
import setMembershipData from './setMemberships.json'

export interface SetTier {
  count: number
  flat?: Partial<Record<StatKey, number>>
  percent?: Partial<Record<StatKey, number>>
}

/** 「攻擊力/魔力 +n」是一條給兩種數值 */
const power = (n: number) => ({ attackPower: n, magicPower: n })

const BASE_SET_TIERS: Record<string, readonly SetTier[]> = {
  永恆套裝: [
    { count: 2, flat: { maxHp: 2500, maxMp: 2500, ...power(40) }, percent: { bossDamage: 10 } },
    {
      count: 3,
      flat: { allStat: 50, defense: 600, ...power(40) },
      percent: { bossDamage: 10 },
    },
    { count: 4, flat: power(40), percent: { maxHp: 15, maxMp: 15, bossDamage: 10 } },
    { count: 5, flat: power(40), percent: { ignoreDefense: 20 } },
    { count: 6, flat: power(40), percent: { bossDamage: 15 } },
    {
      count: 7,
      flat: { allStat: 50, maxHp: 2500, maxMp: 2500, ...power(40) },
      percent: { bossDamage: 15 },
    },
    { count: 8, flat: power(40), percent: { bossDamage: 15 } },
  ],
  航海師套裝: [
    { count: 2, flat: { maxHp: 1500, maxMp: 1500, ...power(20) }, percent: { bossDamage: 10 } },
    { count: 3, flat: { allStat: 30, ...power(20) }, percent: { bossDamage: 10 } },
    { count: 4, flat: { defense: 200, ...power(25) }, percent: { ignoreDefense: 10 } },
    { count: 5, flat: power(30), percent: { bossDamage: 10 } },
    { count: 6, flat: power(20), percent: { maxHp: 20, maxMp: 20 } },
    { count: 7, flat: power(20), percent: { ignoreDefense: 10 } },
  ],
  神祕冥界套裝: [
    { count: 2, flat: power(30), percent: { bossDamage: 10 } },
    { count: 3, flat: { defense: 400, ...power(30) }, percent: { ignoreDefense: 10 } },
    { count: 4, flat: { allStat: 50, ...power(35) }, percent: { bossDamage: 10 } },
    { count: 5, flat: { maxHp: 2000, maxMp: 2000, ...power(40) }, percent: { bossDamage: 10 } },
    { count: 6, flat: power(30), percent: { maxHp: 30, maxMp: 30 } },
    { count: 7, flat: power(30), percent: { ignoreDefense: 10 } },
  ],
  頂級培羅德套裝: [
    { count: 2, flat: { allStat: 20, maxHp: 1500, maxMp: 1500 } },
    { count: 3, flat: power(35), percent: { maxHp: 13, maxMp: 13 } },
    { count: 4, percent: { bossDamage: 30, ignoreDefense: 30 } },
  ],
  漆黑BOSS套裝: [
    { count: 2, flat: { allStat: 10, maxHp: 250, ...power(10) }, percent: { bossDamage: 10 } },
    {
      count: 3,
      flat: { allStat: 10, maxHp: 250, defense: 250, ...power(10) },
      percent: { ignoreDefense: 10 },
    },
    { count: 4, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { critDamage: 5 } },
    { count: 5, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { bossDamage: 10 } },
    { count: 6, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { ignoreDefense: 10 } },
    { count: 7, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { critDamage: 5 } },
    { count: 8, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { bossDamage: 10 } },
    { count: 9, flat: { allStat: 15, maxHp: 375, ...power(15) }, percent: { critDamage: 5 } },
    { count: 10, flat: { allStat: 20, maxHp: 500, ...power(20) }, percent: { bossDamage: 10 } },
  ],
  死後世界的的痕跡: [{ count: 3, flat: power(10) }],
  // 小小時光音樂會套組只給技能，不進裝備道具的能力值加總
  小小時光音樂會套組: [],
}

/** 這三組在遊戲內依職業群拆成各自獨立的套裝，階層效果相同、計數各自獨立 */
const JOB_SPLIT_FAMILIES = new Set(['永恆套裝', '航海師套裝', '神祕冥界套裝'])
export const JOB_GROUPS = ['劍士', '法師', '弓箭手', '盜賊', '海盜'] as const

export const SET_TIERS: Record<string, readonly SetTier[]> = Object.fromEntries(
  Object.entries(BASE_SET_TIERS).flatMap(([name, tiers]) =>
    JOB_SPLIT_FAMILIES.has(name)
      ? JOB_GROUPS.map((job) => [`${name}(${job})`, tiers] as const)
      : [[name, tiers] as const],
  ),
)
/** 取某組套裝在指定件數下生效的所有階層 */
export function activeTiers(setName: string, count: number): readonly SetTier[] {
  const tiers = SET_TIERS[setName]
  if (!tiers) return []
  return tiers.filter((tier) => tier.count <= count)
}

/** 這組套裝是否已收錄在自建表中；未收錄者需退回使用 API 資料 */
export function hasSetTiers(setName: string): boolean {
  return setName in SET_TIERS
}
