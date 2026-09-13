// 白金鐵鎚：追加卷軸強化次數。
//
// 數值取自遊戲內拍賣場的道具 tooltip（玩家提供截圖），不是網路整理表。
// 黃金鐵鎚已從遊戲移除，所以只收白金。
//
// 失敗不會消耗強化次數，只消耗鐵鎚本身 —— 所以「期望要買幾支」是各階
// 成功率倒數的累加，而不是一次性的成本。

export const MAX_HAMMER = 5

/** 第 n 次追加的成功率（索引 0 ＝ 0→1） */
const STEP_RATES: readonly number[] = [0.5, 0.25, 0.1, 0.05, 0.02]

/** 拍賣參考價（楓幣）：7 日平均單品價 13億8317萬1912 */
export const HAMMER_PRICE = 1_383_171_912

/** 一路成功敲到第 n 次的機率 */
export function reachChance(n: number): number {
  return STEP_RATES.slice(0, n).reduce((p, rate) => p * rate, 1)
}

/**
 * 敲到第 n 次期望要用掉幾支鐵鎚。
 *
 * 失敗不會退階（強化次數不消耗），所以每一階是獨立的幾何分布，
 * 期望次數就是成功率倒數；總和即為期望支數。
 */
export function expectedHammers(n: number): number {
  return STEP_RATES.slice(0, n).reduce((sum, rate) => sum + 1 / rate, 0)
}

export interface HammerOption {
  count: number
  label: string
  /** 一路成功的機率，0 次為 1 */
  chance: number
  expectedCost: number
}

export const HAMMER_OPTIONS: readonly HammerOption[] = Array.from(
  { length: MAX_HAMMER + 1 },
  (_, count) => ({
    count,
    label: count === 0 ? '無' : `+${count} 次`,
    chance: reachChance(count),
    expectedCost: expectedHammers(count) * HAMMER_PRICE,
  }),
)
