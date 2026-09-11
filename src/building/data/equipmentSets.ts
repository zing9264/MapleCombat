// 套裝成員對照表。
//
// 為什麼需要這張表：NEXON API 的 `set_effect.total_set_count` **兩個方向都會錯**，
// 實測與遊戲內套裝視窗比對的結果：
//
//   航海師套裝(法師)   API 3 → 實際 4   創世長杖以「幸運道具」身分計入，API 沒算
//   永恆套裝(法師)     API 2 → 實際 3   創世長杖本身是永恆套裝武器，API 沒算
//   神祕冥界套裝(法師) API 3 → 實際 2   API 多算
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
}

/**
 * 創世／命運武器同時屬於永恆套裝，又能以「幸運道具」身分計入另一組套裝。
 * 這是 API 件數出錯的主因，必須特別處理。
 */
export const LUCKY_ITEM_NAMES: ReadonlySet<string> = new Set(['創世長杖', '命運長杖'])

export const SET_MEMBERSHIPS: readonly SetMembership[] = [
  // ── 永恆套裝(法師) ────────────────────────────
  { itemName: '永恆法師長袍', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師褲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師帽', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆法師斗篷', setNames: ['永恆套裝(法師)'] },
  // 創世長杖同時算永恆套裝的武器欄，以及一組幸運道具指定的套裝
  { itemName: '創世長杖', setNames: ['永恆套裝(法師)', '航海師套裝(法師)'] },

  // ── 航海師套裝(法師) ──────────────────────────
  { itemName: '航海師法師鞋', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師帽', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師套裝', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師法師手套', setNames: ['航海師套裝(法師)'] },

  // ── 神祕冥界套裝(法師) ────────────────────────
  { itemName: '神祕冥界幽靈魔法帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士套裝', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔導士鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈法師斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔法護肩', setNames: ['神祕冥界套裝(法師)'] },

  // ── 頂級培羅德套裝（全 4 件已驗證）────────────
  { itemName: '頂級培羅德耳環', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德烙印墜飾', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德烙印腰帶', setNames: ['頂級培羅德套裝'] },
  { itemName: '頂級培羅德戒指', setNames: ['頂級培羅德套裝'] },

  // ── 漆黑BOSS套裝（成員名稱不規則，只能逐一列）──
  { itemName: '口紅控制器標誌', setNames: ['漆黑BOSS套裝'] },
  { itemName: '附有魔力的眼罩', setNames: ['漆黑BOSS套裝'] },
  { itemName: '苦痛的根源', setNames: ['漆黑BOSS套裝'] },
  { itemName: '巨大的恐怖', setNames: ['漆黑BOSS套裝'] },
  { itemName: '受詛咒的青魔導書', setNames: ['漆黑BOSS套裝'] },
  { itemName: '黑心', setNames: ['漆黑BOSS套裝'] },
  { itemName: '全面控制核心', setNames: ['漆黑BOSS套裝'] },
  { itemName: '夢幻的腰帶', setNames: ['漆黑BOSS套裝'] },
  { itemName: '創世的胸章', setNames: ['漆黑BOSS套裝'] },
  { itemName: '指揮官力量耳環', setNames: ['漆黑BOSS套裝'] },
  // 套裝視窗寫「在米特拉的憤怒中選1」，實際道具名依職業不同
  { itemName: '米特拉的憤怒：法師', setNames: ['漆黑BOSS套裝'] },
  { itemName: '米特拉的憤怒：劍士', setNames: ['漆黑BOSS套裝'] },
  { itemName: '米特拉的憤怒：弓箭手', setNames: ['漆黑BOSS套裝'] },
  { itemName: '米特拉的憤怒：盜賊', setNames: ['漆黑BOSS套裝'] },
  { itemName: '米特拉的憤怒：海盜', setNames: ['漆黑BOSS套裝'] },

  // 其他職業的同系列裝備（道具名稱由裝備庫爬蟲收錄後補齊）
  { itemName: '永恆弓箭手連帽衫', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜大衣', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊上衣', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士鎧甲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士手套', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手斗篷', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜斗篷', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊斗篷', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士斗篷', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士肩膀', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手帽', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜帽', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊頭巾', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士頭盔', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士鞋', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆弓箭手褲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆海盜褲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆盜賊褲', setNames: ['永恆套裝(法師)'] },
  { itemName: '永恆劍士褲', setNames: ['永恆套裝(法師)'] },

  // 其他職業的同系列裝備（道具名稱由裝備庫爬蟲收錄後補齊）
  { itemName: '航海師弓箭手手套', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師海盜手套', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊手套', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師劍士手套', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師弓箭手斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師海盜斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師劍士斗篷', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師弓箭手護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師海盜護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師劍士護肩', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊套裝', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師海盜帽', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊帽', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師劍士頭盔', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師調節器', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師弓箭手鞋', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師海盜鞋', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師盜賊鞋', setNames: ['航海師套裝(法師)'] },
  { itemName: '航海師劍士鞋', setNames: ['航海師套裝(法師)'] },

  // 其他職業的同系列裝備（道具名稱由裝備庫爬蟲收錄後補齊）
  { itemName: '神祕冥界幽靈之弓', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈刀', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈小偷手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈弓手手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士手套', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈古代之弓', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈小偷斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈弓手斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士斗篷', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈小偷護肩', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈弓手護肩', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜護肩', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士護肩', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈長杖', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜套裝', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士套裝', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈陰陽扇', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈小偷帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈弓手帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士帽', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈短杖', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈短刀', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈小偷鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈弓手鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈海盜鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈騎士鞋子', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈之刃', setNames: ['神祕冥界套裝(法師)'] },
  { itemName: '神祕冥界幽靈魔劍', setNames: ['神祕冥界套裝(法師)'] },
  // ── 死後世界的的痕跡（圖騰）───────────────────
  { itemName: '萬事的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '阿德勒的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '貝奧武夫的痕跡', setNames: ['死後世界的的痕跡'] },
  { itemName: '柏林的痕跡', setNames: ['死後世界的的痕跡'] },
]

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

export interface SetTier {
  count: number
  flat?: Partial<Record<StatKey, number>>
  percent?: Partial<Record<StatKey, number>>
}

/** 「攻擊力/魔力 +n」是一條給兩種數值 */
const power = (n: number) => ({ attackPower: n, magicPower: n })

export const SET_TIERS: Record<string, readonly SetTier[]> = {
  '永恆套裝(法師)': [
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
  '航海師套裝(法師)': [
    { count: 2, flat: { maxHp: 1500, maxMp: 1500, ...power(20) }, percent: { bossDamage: 10 } },
    { count: 3, flat: { allStat: 30, ...power(20) }, percent: { bossDamage: 10 } },
    { count: 4, flat: { defense: 200, ...power(25) }, percent: { ignoreDefense: 10 } },
    { count: 5, flat: power(30), percent: { bossDamage: 10 } },
    { count: 6, flat: power(20), percent: { maxHp: 20, maxMp: 20 } },
    { count: 7, flat: power(20), percent: { ignoreDefense: 10 } },
  ],
  '神祕冥界套裝(法師)': [
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
