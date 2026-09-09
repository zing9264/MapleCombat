// 強化卷軸對照表。
//
// 數值全部取自遊戲內拍賣場的卷軸 tooltip（玩家提供截圖），不是網路整理表。
// 只收常用的幾張；遊戲內種類太多，全做不划算。
//
// 卷軸效果依「部位類別」不同（防具／武器／飾品…），同一名稱不同部位的數值不同，
// 因此 id 要帶部位類別。目前只有「防具 · 魔力」系列，其他系列等截圖再補。
//
// 隨機卷（命運／星彩／救世）以「各結果的機率」保存，製作台用期望值套用，
// 但保留分布供成本策略使用。

import type { ItemOption } from '../services/nexonApi'

/** 卷軸能作用的部位類別 */
export type ScrollCategory = '防具' | '武器' | '飾品'

export interface ScrollOutcome {
  /** 這次結果對裝備加的數值 */
  option: Partial<ItemOption>
  /** 出現機率（0~1），固定卷為 1 */
  probability: number
}

export interface ScrollDef {
  id: string
  name: string
  category: ScrollCategory
  /** 成功率（0~1） */
  successRate: number
  outcomes: ScrollOutcome[]
  /** 裝備等級限制（含），無則不限 */
  maxItemLevel?: number
  /** 拍賣參考價（楓幣），供成本估算，會隨時間變動 */
  referencePrice?: number
  note?: string
}

const fixed = (option: Partial<ItemOption>): ScrollOutcome[] => [{ option, probability: 1 }]

/** 只有魔力一種數值的隨機卷 */
const magicRange = (table: Record<number, number>): ScrollOutcome[] =>
  Object.entries(table).map(([value, pct]) => ({
    option: { magic_power: value },
    probability: pct / 100,
  }))

export const SCROLLS: readonly ScrollDef[] = [
  {
    id: 'armor-magic-ultimate-dark',
    name: '究極的黑暗防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: fixed({ magic_power: '9', str: '2', dex: '2', int: '2', luk: '2' }),
    referencePrice: 13_866_666_666,
  },
  {
    id: 'armor-magic-v',
    name: 'V防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: fixed({ magic_power: '8' }),
    referencePrice: 3_888_880_000,
  },
  {
    id: 'armor-magic-x',
    name: 'X防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: fixed({ magic_power: '7' }),
    referencePrice: 1_154_166_667,
  },
  {
    id: 'armor-magic-red',
    name: 'RED防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: fixed({ magic_power: '5' }),
    referencePrice: 664_443_333,
  },
  {
    id: 'armor-magic-destiny',
    name: '命運防具魔力卷軸',
    category: '防具',
    successRate: 1,
    maxItemLevel: 200,
    outcomes: magicRange({ 7: 4, 8: 6, 9: 31, 10: 30, 11: 14, 12: 7, 13: 5, 14: 2, 15: 1 }),
    referencePrice: 8_500_000_000,
    note: '僅限 200 等級以下（含）裝備',
  },
  {
    id: 'armor-magic-starlight',
    name: '星彩防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: magicRange({ 11: 10, 12: 22, 13: 28, 14: 18, 15: 12, 16: 10 }),
    referencePrice: 34_999_999_999,
  },
  {
    id: 'armor-magic-savior',
    name: '救世防具魔力卷軸',
    category: '防具',
    successRate: 1,
    outcomes: magicRange({ 10: 35, 11: 30, 12: 15, 13: 8, 14: 7, 15: 5 }),
    referencePrice: 16_666_666_666,
  },
]

const BY_ID = new Map(SCROLLS.map((s) => [s.id, s]))

export function getScroll(id: string): ScrollDef | undefined {
  return BY_ID.get(id)
}

/** 卷軸能用的部位對應到類別；不在表上的部位視為無法上卷 */
const PART_CATEGORY: Record<string, ScrollCategory> = {
  帽子: '防具',
  上衣: '防具',
  '褲/裙': '防具',
  套服: '防具',
  鞋子: '防具',
  手套: '防具',
  披風: '防具',
  肩膀裝飾: '防具',
  盾牌: '防具',
  臉飾: '飾品',
  眼飾: '飾品',
  耳環: '飾品',
  戒指: '飾品',
  墜飾: '飾品',
  腰帶: '飾品',
  口袋道具: '飾品',
  機器心臟: '武器', // 機器心臟吃的是武器卷
  徽章: '飾品',
  勳章: '飾品',
}

/** 各職業武器的部位名稱；不在此表也不在 PART_CATEGORY 的部位（圖騰、寶石、胸章…）視為無法上卷 */
const WEAPON_PARTS: ReadonlySet<string> = new Set([
  '長杖',
  '短杖',
  '單手劍',
  '單手斧',
  '單手棍',
  '雙手劍',
  '雙手斧',
  '雙手棍',
  '槍',
  '矛',
  '弓',
  '弩',
  '短刀',
  '拳套',
  '指虎',
  '火槍',
  '雙刀',
  '魔劍',
  '加農砲',
  '能量劍',
  '手杖',
  '鞭劍',
  '長槍',
  '太刀',
  '扇子',
  '弓箭手用槍',
  '重拳槍',
  '鎖鏈',
  'ESP限制器',
  '劍',
  '魔法弓',
  '水晶球',
  '鍊',
  '龍',
  '鍵盤',
  '武器',
])

export function scrollCategoryOf(part: string): ScrollCategory | null {
  if (PART_CATEGORY[part]) return PART_CATEGORY[part]
  return WEAPON_PARTS.has(part) ? '武器' : null
}

export function scrollsFor(part: string, itemLevel: number): ScrollDef[] {
  const category = scrollCategoryOf(part)
  if (!category) return []
  return SCROLLS.filter(
    (s) => s.category === category && (s.maxItemLevel === undefined || itemLevel <= s.maxItemLevel),
  )
}

/** 期望值：每個能力值欄位的機率加權和 */
export function expectedOption(scroll: ScrollDef): Record<string, number> {
  const result: Record<string, number> = {}
  for (const outcome of scroll.outcomes) {
    for (const [key, value] of Object.entries(outcome.option)) {
      result[key] = (result[key] ?? 0) + Number(value ?? 0) * outcome.probability
    }
  }
  return result
}
