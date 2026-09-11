import { describe, expect, it } from 'vitest'
import {
  aggregateEquipment,
  combineMultiplicative,
  computeSwapDelta,
  type GearForCompare,
} from '@/building/core/equipmentDelta'
import type { SetEffectEntry } from '@/building/services/nexonApi'
import fixture from './fixtures/equipment-set.json'

/**
 * 283 級主教「藜樂拌楓糖」的 29 件實際裝備與 7 組套裝效果，
 * 四層數值與潛能字串全部取自 API。
 */
const ITEMS = fixture.items as GearForCompare[]
const SET_EFFECTS = fixture.setEffects as SetEffectEntry[]
const LEVEL = fixture.characterLevel

const input = { items: ITEMS, setEffects: SET_EFFECTS, characterLevel: LEVEL }

describe('aggregateEquipment', () => {
  it('套裝件數由實際裝備反推，與遊戲內套裝視窗一致', () => {
    const { setCounts } = aggregateEquipment(input)
    // API 的 total_set_count 兩個方向都會錯，這裡驗證我們沒有採用它
    expect(setCounts['永恆套裝(法師)']).toBe(3)
    expect(setCounts['航海師套裝(法師)']).toBe(4)
    expect(setCounts['神祕冥界套裝(法師)']).toBe(2)
    expect(setCounts['漆黑BOSS套裝']).toBe(5)
  })

  it('INT 百分比包含裝備潛能與套裝的全屬性%', () => {
    const total = aggregateEquipment(input)
    expect(total.percent.int).toBeGreaterThan(0)
    expect(total.flat.int).toBeGreaterThan(0)
  })

  it('無視防禦率走乘法疊加，不會被直接相加', () => {
    const total = aggregateEquipment(input)
    const parts = total.multiplicative.ignoreDefense ?? []
    expect(parts.length).toBeGreaterThan(1)
    const combined = combineMultiplicative(parts)
    const naiveSum = parts.reduce((a, b) => a + b, 0)
    expect(combined).toBeLessThan(naiveSum)
    expect(combined).toBeLessThan(100)
  })

  it('解析不出來的潛能會被回報而不是丟掉', () => {
    const total = aggregateEquipment(input)
    // 「被擊中時有20% 機率無視39 傷害」是條件觸發型，無法靜態換算
    expect(total.unrecognized.some((line) => line.includes('被擊中時'))).toBe(true)
  })
})

describe('combineMultiplicative', () => {
  it('兩項 50% 疊起來是 75%，不是 100%', () => {
    expect(combineMultiplicative([50, 50])).toBe(75)
  })

  it('空清單回傳 0', () => {
    expect(combineMultiplicative([])).toBe(0)
    expect(combineMultiplicative(undefined)).toBe(0)
  })
})

describe('computeSwapDelta — 拔掉永恆法師褲', () => {
  const result = computeSwapDelta({ ...input, replaceName: '永恆法師褲', replacement: null })

  it('永恆套裝從 3 件掉到 2 件', () => {
    const change = result.setChanges.find((c) => c.setName === '永恆套裝(法師)')
    expect(change).toEqual({ setName: '永恆套裝(法師)', before: 3, after: 2 })
  })

  it('連帶失去永恆 3 套的全屬性 +50', () => {
    // 這正是必須重算整套的理由：光看褲子本身的數值會少算這 50 點
    const pantsAllStat = 0 // 褲子本身沒有全屬性固定值
    const diff = result.diffs.find((d) => d.stat === 'int' && d.kind === 'flat')!
    const pantsInt =
      (ITEMS.find((i) => i.name === '永恆法師褲')!.base?.int ?? 0) +
      (ITEMS.find((i) => i.name === '永恆法師褲')!.starforce?.int ?? 0) +
      (ITEMS.find((i) => i.name === '永恆法師褲')!.etc?.int ?? 0) +
      (ITEMS.find((i) => i.name === '永恆法師褲')!.add?.int ?? 0)
    expect(pantsAllStat).toBe(0)
    // 掉的 INT 比褲子自己的 INT 還多，多出來的就是套裝的全屬性 +50
    expect(Math.abs(diff.delta)).toBe(pantsInt + 50)
  })

  it('Boss 傷害也跟著掉 10%（永恆 3 套的效果）', () => {
    const diff = result.diffs.find((d) => d.stat === 'bossDamage')
    expect(diff?.delta).toBe(-10)
  })

  it('所有差異都是負的（純拔裝備不會變強）', () => {
    for (const diff of result.diffs) {
      expect(diff.delta).toBeLessThanOrEqual(0)
    }
  })
})

describe('computeSwapDelta — 換上更好的褲子', () => {
  const better: GearForCompare = {
    name: '永恆法師褲',
    part: '褲/裙',
    base: { int: 50, luk: 50, magicPower: 6, armor: 325 },
    starforce: { int: 159, luk: 159, str: 119, dex: 119, magicPower: 120 },
    etc: { int: 60, magicPower: 150 },
    add: { int: 71, str: 21, dex: 26 },
    potentials: ['INT +13%', 'INT +13%', 'INT +13%'],
    additionalPotentials: ['INT +9%', '全屬性 +7%', '魔法攻擊力 +12'],
  }

  const result = computeSwapDelta({
    ...input,
    replaceName: '永恆法師褲',
    replacement: better,
  })

  it('同名替換不會改變套裝件數', () => {
    expect(result.setChanges).toHaveLength(0)
  })

  it('魔攻與 INT% 都上升', () => {
    const magic = result.diffs.find((d) => d.stat === 'magicPower')
    const intPercent = result.diffs.find((d) => d.stat === 'int' && d.kind === 'percent')
    expect(magic!.delta).toBeGreaterThan(0)
    expect(intPercent!.delta).toBeGreaterThan(0)
  })

  it('差異依影響大小排序', () => {
    const magnitudes = result.diffs.map((d) => Math.abs(d.delta))
    expect(magnitudes).toEqual([...magnitudes].sort((a, b) => b - a))
  })
})

describe('computeSwapDelta — 邊界情況', () => {
  it('換一件不存在的裝備等於純新增', () => {
    const extra: GearForCompare = { name: '測試戒指', part: '戒指', base: { int: 100 } }
    const result = computeSwapDelta({ ...input, replaceName: '不存在的裝備', replacement: extra })
    const diff = result.diffs.find((d) => d.stat === 'int' && d.kind === 'flat')
    expect(diff!.delta).toBe(100)
  })

  it('換成完全一樣的裝備沒有任何差異', () => {
    const pants = ITEMS.find((i) => i.name === '永恆法師褲')!
    const result = computeSwapDelta({ ...input, replaceName: '永恆法師褲', replacement: pants })
    expect(result.diffs).toHaveLength(0)
    expect(result.setChanges).toHaveLength(0)
  })
})

describe('computeSwapDelta — 同名裝備只換指定的那一件', () => {
  // 身上可能同時戴兩顆同名戒指；只用名稱指定會兩顆一起拔掉
  const ring: GearForCompare = { name: '重複的戒指', part: '戒指', base: { int: 30 } }
  const items = [ring, { ...ring }]

  it('用 replaceIndex 只拔掉其中一顆', () => {
    const result = computeSwapDelta({
      items,
      setEffects: [],
      characterLevel: LEVEL,
      replaceName: '重複的戒指',
      replaceIndex: 0,
      replacement: null,
    })
    expect(result.diffs.find((d) => d.stat === 'int')?.delta).toBe(-30)
  })

  it('只給名稱時兩顆都會被拔掉（這是改用位置指定的理由）', () => {
    const result = computeSwapDelta({
      items,
      setEffects: [],
      characterLevel: LEVEL,
      replaceName: '重複的戒指',
      replacement: null,
    })
    expect(result.diffs.find((d) => d.stat === 'int')?.delta).toBe(-60)
  })
})
