// 裝備差異 → 上游戰鬥力公式的欄位差值。
//
// 為什麼是「差值」而不是直接算絕對戰鬥力：
// API 的 final_stat 是**合成後**的面板值，拆不回公式要的 基本數值／％／％未套用。
// 實測過：拿面板值直接套公式，反推出來的最終傷害倍率是 0.687（小於 1，不可能）。
// 百分比更不能硬估 —— 總值 = 基底 ×(1+P/100)，再加 ΔP 的正確倍率是 1+ΔP/(100+P)，
// 不知道 P 就會差好幾倍。
//
// 所以分工是：
//   基準（分解後的欄位）← 上游「手動覆寫」頁，那正是它在收的東西
//   裝備變動           ← 這裡，產生 delta 餵進 calculatePower(fields, ctx, delta)
// 兩邊都用同一份基準，差值就是精確的，不是估算。

import type { FieldValues } from '@/core/types'
import type { AggregatedStats } from './equipmentDelta'
import type { StatKey } from './optionParser'

/** 這個職業的主屬／副屬／攻擊力對應到哪個 StatKey */
export interface StatSlots {
  main: StatKey
  sub: StatKey
  /** 法系吃魔法攻擊力，其餘吃攻擊力 */
  attack: StatKey
}

const LABEL_TO_STAT: Record<string, StatKey> = {
  STR: 'str',
  DEX: 'dex',
  INT: 'int',
  LUK: 'luk',
}

/**
 * 由職業的主副屬性標籤決定要讀哪些欄位。
 * 標籤來自上游的 getJobStatLabelsByName（'STR' / 'DEX' / 'INT' / 'LUK' / 'HP'）。
 *
 * 惡魔復仇者的主屬是 HP，戰鬥力走的是另一條 equivalentMain 路徑，
 * 這裡回傳 null 讓呼叫端明確地不支援，而不是悄悄算成 0。
 */
export function statSlotsFor(mainLabel: string, subLabel: string): StatSlots | null {
  const main = LABEL_TO_STAT[mainLabel]
  const sub = LABEL_TO_STAT[subLabel]
  if (!main || !sub) return null
  return { main, sub, attack: main === 'int' ? 'magicPower' : 'attackPower' }
}

const flatOf = (stats: AggregatedStats, key: StatKey): number => stats.flat[key] ?? 0
const percentOf = (stats: AggregatedStats, key: StatKey): number => stats.percent[key] ?? 0

/**
 * 換裝前後的裝備加總 → 上游欄位的差值。
 *
 * 刻意**不**包含無視防禦率：它不在戰鬥力公式裡（只在 actualDamage 的實戰公式，
 * 見 src/core/actualDamage.ts）。把它算進來會讓戰鬥力憑空多出不存在的變化。
 * 同理也不含防禦力、MaxHP —— 一般職業的戰鬥力公式不吃這些。
 */
export function equipmentFieldDelta(
  before: AggregatedStats,
  after: AggregatedStats,
  slots: StatSlots,
): FieldValues {
  const flatDiff = (key: StatKey) => flatOf(after, key) - flatOf(before, key)
  const percentDiff = (key: StatKey) => percentOf(after, key) - percentOf(before, key)

  return {
    baseMain: flatDiff(slots.main),
    percentMain: percentDiff(slots.main),
    baseSub: flatDiff(slots.sub),
    percentSub: percentDiff(slots.sub),
    atk: flatDiff(slots.attack),
    percentAtk: percentDiff(slots.attack),
    dmg: percentDiff('damage'),
    bossDmg: percentDiff('bossDamage'),
    critDmg: percentDiff('critDamage'),
  }
}

/** 差值是不是全部為 0（換了裝備但對戰鬥力沒有影響） */
export function isEmptyDelta(delta: FieldValues): boolean {
  return Object.values(delta).every((value) => value === 0)
}
