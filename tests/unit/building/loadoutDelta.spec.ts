import { describe, expect, it } from 'vitest'
import {
  aggregateEquipment,
  computeLoadoutDelta,
  type GearForCompare,
} from '@/building/core/equipmentDelta'

const LEVEL = 283

/** 最精簡的裝備：只有白底數值，方便手算驗證 */
function gear(name: string, part: string, int: number, magicPower = 0): GearForCompare {
  return { name, part, base: { int, magicPower } }
}

/**
 * 兩件永恆法師裝 = 永恆套裝(法師) 2 件，會拿到第 2 階
 * （MaxHP/MaxMP +2500、攻擊力/魔力 +40、BOSS傷害 +10%）。
 * 換掉其中一件就會掉這一整階 —— 這正是不能把單件差值相加的原因。
 */
const BASE_ITEMS: GearForCompare[] = [
  gear('永恆法師長袍', '上衣', 100),
  gear('永恆法師褲', '褲/裙', 80),
  gear('巨大的恐怖', '戒指', 50),
  gear('天上的氣息', '戒指', 40),
]

const input = (replacements: { index: number; replacement: GearForCompare | null }[]) => ({
  items: BASE_ITEMS,
  setEffects: [],
  characterLevel: LEVEL,
  replacements,
})

describe('computeLoadoutDelta — 一次換多件', () => {
  it('沒有任何替換時不產生差異', () => {
    const result = computeLoadoutDelta(input([]))
    expect(result.diffs).toEqual([])
    expect(result.setChanges).toEqual([])
  })

  it('結果與「整套重算」一致', () => {
    const replacement = gear('自製上衣', '上衣', 300)
    const result = computeLoadoutDelta(input([{ index: 0, replacement }]))

    const expected = aggregateEquipment({
      items: [BASE_ITEMS[1], BASE_ITEMS[2], BASE_ITEMS[3], replacement],
      setEffects: [],
      characterLevel: LEVEL,
    })
    expect(result.after.flat).toEqual(expected.flat)
    expect(result.after.setCounts).toEqual(expected.setCounts)
  })

  it('同時換兩件永恆裝，套裝件數一次掉 2 件', () => {
    const result = computeLoadoutDelta(
      input([
        { index: 0, replacement: gear('自製上衣', '上衣', 300) },
        { index: 1, replacement: gear('自製褲子', '褲/裙', 300) },
      ]),
    )

    const change = result.setChanges.find((c) => c.setName === '永恆套裝(法師)')
    expect(change).toEqual({ setName: '永恆套裝(法師)', before: 2, after: 0 })
  })

  it('掉整階套裝效果時，魔力反而變少 —— 不能只把裝備數值相減', () => {
    // 兩件換上的自製裝各 +0 魔力，但掉了第 2 階的攻擊力/魔力 +40
    const result = computeLoadoutDelta(
      input([
        { index: 0, replacement: gear('自製上衣', '上衣', 100) },
        { index: 1, replacement: gear('自製褲子', '褲/裙', 80) },
      ]),
    )

    const magic = result.diffs.find((d) => d.stat === 'magicPower' && d.kind === 'flat')
    expect(magic?.delta).toBe(-40)

    const boss = result.diffs.find((d) => d.stat === 'bossDamage' && d.kind === 'percent')
    expect(boss?.delta).toBe(-10)
  })

  it('以位置指定，只換掉那一顆戒指', () => {
    const result = computeLoadoutDelta(input([{ index: 2, replacement: null }]))
    // 只拔掉 index 2（巨大的恐怖 INT 50），index 3 的戒指要留著
    const int = result.diffs.find((d) => d.stat === 'int' && d.kind === 'flat')
    expect(int?.delta).toBe(-50)
  })

  it('同一個位置重複指定時以最後一筆為準', () => {
    const result = computeLoadoutDelta(
      input([
        { index: 2, replacement: gear('先選的', '戒指', 10) },
        { index: 2, replacement: gear('後選的', '戒指', 70) },
      ]),
    )
    const int = result.diffs.find((d) => d.stat === 'int' && d.kind === 'flat')
    expect(int?.delta).toBe(20) // 70 − 50
  })

  it('超出範圍的位置直接忽略，不會炸也不會誤刪', () => {
    const result = computeLoadoutDelta(input([{ index: 99, replacement: null }]))
    expect(result.diffs).toEqual([])
  })

  it('一次拔掉全部裝備', () => {
    const result = computeLoadoutDelta(
      input(BASE_ITEMS.map((_, index) => ({ index, replacement: null }))),
    )
    expect(Object.keys(result.after.setCounts)).toHaveLength(0)
    const int = result.diffs.find((d) => d.stat === 'int' && d.kind === 'flat')
    expect(int?.after).toBe(0)
  })
})
