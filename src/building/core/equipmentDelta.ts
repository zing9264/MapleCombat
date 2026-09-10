// 換裝比較引擎：把一整套裝備加總成能力值，並算出換一件之後的差值。
//
// 三件事讓這比「把兩件裝備相減」複雜得多：
//
// 1. 換裝會改變套裝件數。拔掉一件永恆裝可能整階套裝效果消失，那通常比裝備
//    本身的數值還大。所以必須以「整套」為單位重算，不能只看被換掉的那件。
// 2. 無視防禦率是乘法疊加，不能相加。
// 3. 潛能是自由文字，要先經過解析器；解析不出來的必須回報而不是丟掉。
//
// API 的 set_effect 不能直接用：件數兩個方向都會錯，而它又只回傳「已達成」的
// 階層，於是漏報的那幾階連效果內容都拿不到（實測永恆套裝實際 3 件、API 說 2 件，
// 第 3 階的全屬性 +50 完全查不到）。因此件數由實際裝備反推，效果內容優先用
// 自建的 SET_TIERS，未收錄的套裝才退回 API 資料。

import type { SetEffectEntry } from '../services/nexonApi'
import { activeTiers, countSetPieces, hasSetTiers } from '../data/equipmentSets'
import {
  MULTIPLICATIVE_STATS,
  emptyTotals,
  sumOptions,
  type StatKey,
  type StatTotals,
} from './optionParser'
import type { NumericOption } from './starforce'

/** 一件裝備在比較時需要的資料。與 API 抓下來的裝備、製作台做出來的自製裝備同形。 */
export interface GearForCompare {
  name: string
  part: string
  /** 白：基底 */
  base?: NumericOption
  /** 黃：星力 */
  starforce?: NumericOption
  /** 紫：卷軸 */
  etc?: NumericOption
  /** 藍綠：星火 */
  add?: NumericOption
  potentials?: readonly string[]
  additionalPotentials?: readonly string[]
}

export interface AggregatedStats extends StatTotals {
  /** 乘法疊加的項目保留各自的分項，合成時才不會算錯 */
  multiplicative: Partial<Record<StatKey, number[]>>
  /** 每組套裝實際生效的件數 */
  setCounts: Record<string, number>
}

/** API 的底線命名對到解析器的 StatKey */
const OPTION_KEY_MAP: Record<string, StatKey> = {
  str: 'str',
  dex: 'dex',
  int: 'int',
  luk: 'luk',
  maxHp: 'maxHp',
  maxMp: 'maxMp',
  attackPower: 'attackPower',
  magicPower: 'magicPower',
  armor: 'defense',
  bossDamage: 'bossDamage',
  ignoreDefense: 'ignoreDefense',
  damage: 'damage',
  allStat: 'allStat',
  critDamage: 'critDamage',
}

function emptyAggregate(): AggregatedStats {
  return { ...emptyTotals(), multiplicative: {}, setCounts: {} }
}

const FOUR_STATS: readonly StatKey[] = ['str', 'dex', 'int', 'luk']

/**
 * 全屬性一律攤到四項屬性上，不另外保留一個 allStat 欄位。
 *
 * 遊戲的算法就是如此：實測對帳時，INT 的「裝備道具 628%」正是
 * 潛能 INT% 522 + 潛能全屬性% 81 + 裝備全屬性% 25 加起來的結果。
 * 若把 allStat 獨立保存，上層每次用到都得記得再攤一次，遲早會漏。
 */
function addFlat(target: AggregatedStats, stat: StatKey, value: number): void {
  if (!value) return
  if (stat === 'allStat') {
    for (const each of FOUR_STATS) addFlat(target, each, value)
    return
  }
  target.flat[stat] = (target.flat[stat] ?? 0) + value
}

function addPercent(target: AggregatedStats, stat: StatKey, value: number): void {
  if (!value) return
  if (stat === 'allStat') {
    for (const each of FOUR_STATS) addPercent(target, each, value)
    return
  }
  if (MULTIPLICATIVE_STATS.has(stat)) {
    ;(target.multiplicative[stat] ??= []).push(value)
    return
  }
  target.percent[stat] = (target.percent[stat] ?? 0) + value
}

/** 把一層數值（base/starforce/etc/add）併進總計 */
function absorbLayer(target: AggregatedStats, layer: NumericOption | undefined): void {
  if (!layer) return
  for (const [key, value] of Object.entries(layer)) {
    const stat = OPTION_KEY_MAP[key]
    if (!stat) continue
    const num = Number(value ?? 0)
    // 裝備數值層裡只有 allStat 與 ignoreDefense 是百分比，其餘都是固定值
    if (stat === 'allStat' || stat === 'ignoreDefense' || stat === 'bossDamage') {
      addPercent(target, stat, num)
    } else {
      addFlat(target, stat, num)
    }
  }
}

/** 把解析器的結果併進總計 */
function absorbParsed(target: AggregatedStats, parsed: StatTotals): void {
  for (const [stat, value] of Object.entries(parsed.flat)) {
    addFlat(target, stat as StatKey, Number(value ?? 0))
  }
  for (const [stat, value] of Object.entries(parsed.percent)) {
    addPercent(target, stat as StatKey, Number(value ?? 0))
  }
  target.unrecognized.push(...parsed.unrecognized)
}

/**
 * 依實際裝備反推套裝件數，取出生效階層的效果。
 *
 * 效果內容優先用自建的 SET_TIERS：API 的 `set-effect` 只回傳「已達成」階層，
 * 而它的件數是錯的，於是漏報的那幾階連效果內容都拿不到（實測永恆套裝實際
 * 3 件、API 說 2 件，第 3 階的全屬性 +50 完全查不到）。未收錄的套裝才退回 API。
 */
function absorbSetEffects(
  target: AggregatedStats,
  itemNames: readonly string[],
  setEffects: readonly SetEffectEntry[],
  characterLevel: number,
): void {
  const { counts, unknownItems } = countSetPieces(itemNames)
  target.setCounts = counts
  // 對照表查不到的裝備可能讓套裝件數低估，必須讓使用者知道
  for (const name of unknownItems) {
    if (setEffects.some((s) => s.set_name.includes(name))) target.unrecognized.push(name)
  }

  const apiBySetName = new Map(setEffects.map((entry) => [entry.set_name, entry]))
  const setNames = new Set([...Object.keys(counts), ...apiBySetName.keys()])

  for (const setName of setNames) {
    const count = counts[setName] ?? 0
    if (count <= 0) continue

    if (hasSetTiers(setName)) {
      for (const tier of activeTiers(setName, count)) {
        for (const [stat, value] of Object.entries(tier.flat ?? {})) {
          addFlat(target, stat as StatKey, Number(value ?? 0))
        }
        for (const [stat, value] of Object.entries(tier.percent ?? {})) {
          addPercent(target, stat as StatKey, Number(value ?? 0))
        }
      }
      continue
    }

    // 未收錄的套裝退回 API 資料，一階效果是「全屬性 +20, 最大HP +1500」這種字串
    const entry = apiBySetName.get(setName)
    for (const tier of entry?.set_effect_info ?? []) {
      if (Number(tier.set_count) > count) continue
      const lines = String(tier.set_option ?? '').split(/[,\n]/)
      absorbParsed(target, sumOptions(lines, characterLevel))
    }
  }
}

export interface AggregateInput {
  items: readonly GearForCompare[]
  setEffects: readonly SetEffectEntry[]
  characterLevel: number
}

/** 把一整套裝備加總成能力值 */
export function aggregateEquipment(input: AggregateInput): AggregatedStats {
  const total = emptyAggregate()

  for (const item of input.items) {
    absorbLayer(total, item.base)
    absorbLayer(total, item.starforce)
    absorbLayer(total, item.etc)
    absorbLayer(total, item.add)
    absorbParsed(
      total,
      sumOptions(
        [...(item.potentials ?? []), ...(item.additionalPotentials ?? [])],
        input.characterLevel,
      ),
    )
  }

  absorbSetEffects(
    total,
    input.items.map((i) => i.name),
    input.setEffects,
    input.characterLevel,
  )
  return total
}

/** 乘法疊加合成：1 − ∏(1 − v/100)，回傳百分比 */
export function combineMultiplicative(values: readonly number[] | undefined): number {
  if (!values?.length) return 0
  const remaining = values.reduce((acc, v) => acc * (1 - v / 100), 1)
  return (1 - remaining) * 100
}

export interface StatDiff {
  stat: StatKey
  kind: 'flat' | 'percent'
  before: number
  after: number
  delta: number
}

export interface SetCountChange {
  setName: string
  before: number
  after: number
}

export interface SwapResult {
  before: AggregatedStats
  after: AggregatedStats
  diffs: StatDiff[]
  /** 換裝造成的套裝件數變化 —— 通常比裝備本身的數值影響更大 */
  setChanges: SetCountChange[]
  /** 解析不出來的潛能字串，代表這次比較有漏算 */
  unrecognized: string[]
}

const round = (n: number): number => Math.round(n * 1000) / 1000

function collectDiffs(before: AggregatedStats, after: AggregatedStats): StatDiff[] {
  const diffs: StatDiff[] = []

  const keys = new Set<StatKey>([
    ...(Object.keys(before.flat) as StatKey[]),
    ...(Object.keys(after.flat) as StatKey[]),
  ])
  for (const stat of keys) {
    const b = before.flat[stat] ?? 0
    const a = after.flat[stat] ?? 0
    if (a !== b) diffs.push({ stat, kind: 'flat', before: b, after: a, delta: round(a - b) })
  }

  const percentKeys = new Set<StatKey>([
    ...(Object.keys(before.percent) as StatKey[]),
    ...(Object.keys(after.percent) as StatKey[]),
    ...(Object.keys(before.multiplicative) as StatKey[]),
    ...(Object.keys(after.multiplicative) as StatKey[]),
  ])
  for (const stat of percentKeys) {
    const b = MULTIPLICATIVE_STATS.has(stat)
      ? combineMultiplicative(before.multiplicative[stat])
      : (before.percent[stat] ?? 0)
    const a = MULTIPLICATIVE_STATS.has(stat)
      ? combineMultiplicative(after.multiplicative[stat])
      : (after.percent[stat] ?? 0)
    if (round(a) !== round(b)) {
      diffs.push({
        stat,
        kind: 'percent',
        before: round(b),
        after: round(a),
        delta: round(a - b),
      })
    }
  }

  return diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
}

export interface SwapInput extends AggregateInput {
  /** 要換掉的裝備名稱；找不到時視為「純新增」 */
  replaceName: string
  /** 換上的裝備；null 代表直接拔掉 */
  replacement: GearForCompare | null
}

/**
 * 算出換一件裝備前後的差異。
 *
 * 刻意重算整套而不是把兩件相減 —— 換裝會改變套裝件數，
 * 而掉一階套裝效果的影響往往比裝備本身還大。
 */
export function computeSwapDelta(input: SwapInput): SwapResult {
  const before = aggregateEquipment(input)

  const afterItems = input.items.filter((i) => i.name !== input.replaceName)
  if (input.replacement) afterItems.push(input.replacement)
  const after = aggregateEquipment({ ...input, items: afterItems })

  const setNames = new Set([...Object.keys(before.setCounts), ...Object.keys(after.setCounts)])
  const setChanges: SetCountChange[] = []
  for (const setName of setNames) {
    const b = before.setCounts[setName] ?? 0
    const a = after.setCounts[setName] ?? 0
    if (a !== b) setChanges.push({ setName, before: b, after: a })
  }

  return {
    before,
    after,
    diffs: collectDiffs(before, after),
    setChanges,
    unrecognized: [...new Set([...before.unrecognized, ...after.unrecognized])],
  }
}
