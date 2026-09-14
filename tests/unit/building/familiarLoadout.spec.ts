// 萌獸的合計與草稿。
import { describe, expect, it } from 'vitest'
import { summarize, type Familiar } from '@/building/stores/familiar'

const make = (over: Partial<Familiar>): Familiar => ({
  id: over.id ?? 'x',
  label: '',
  finalDamage: 0,
  magicPowerPercent: 0,
  attackPowerPercent: 0,
  equipped: true,
  ...over,
})

describe('summarize', () => {
  it('終傷逐條累加（float32），魔力%／物攻% 相加', () => {
    // 玩家實際的組合：主萌獸 20%+14% ×2、羈絆 2%+4%
    const list = [
      make({ id: 'a', finalDamage: 20, magicPowerPercent: 14 }),
      make({ id: 'b', finalDamage: 20, magicPowerPercent: 14 }),
      make({ id: 'c', finalDamage: 2, magicPowerPercent: 4 }),
    ]
    const result = summarize(list)

    expect(result.totalPercent).toBe(42)
    expect(result.magicPowerPercent).toBe(32)
    // float32 逐條累加，與遊戲內的運算順序一致
    expect(result.multiplier).toBeCloseTo(1.42, 6)
  })

  it('終傷 0 的萌獸不算一條來源', () => {
    // 只給魔力不給終傷的萌獸，送進乘算會多乘一個 ×1.00，來源數也會錯
    const result = summarize([make({ finalDamage: 0, magicPowerPercent: 10 })])
    expect(result.sources).toEqual([])
    expect(result.multiplier).toBe(1)
    expect(result.magicPowerPercent).toBe(10)
  })

  it('空清單是 ×1，不是 0', () => {
    expect(summarize([]).multiplier).toBe(1)
    expect(summarize([]).totalPercent).toBe(0)
  })

  it('逐條與先加總的差距極小，但我們照遊戲逐條算', () => {
    const split = summarize([
      make({ id: 'a', finalDamage: 20 }),
      make({ id: 'b', finalDamage: 20 }),
      make({ id: 'c', finalDamage: 2 }),
    ]).multiplier
    const merged = summarize([make({ finalDamage: 42 })]).multiplier

    expect(split).not.toBe(merged)
    expect(Math.abs(split / merged - 1)).toBeLessThan(0.000001)
  })
})

describe('換萌獸的倍率比值', () => {
  it('卸下一隻主萌獸，倍率比值就是換裝要乘的係數', () => {
    // 裝備變更頁把這個比值丟進上游的 __eqFamFinalMultiplierFactor
    const before = summarize([
      make({ id: 'a', finalDamage: 20 }),
      make({ id: 'b', finalDamage: 20 }),
      make({ id: 'c', finalDamage: 2 }),
    ])
    const after = summarize([make({ id: 'b', finalDamage: 20 }), make({ id: 'c', finalDamage: 2 })])

    expect(before.multiplier).toBeCloseTo(1.42, 6)
    expect(after.multiplier).toBeCloseTo(1.22, 6)
    expect(after.multiplier / before.multiplier).toBeCloseTo(1.22 / 1.42, 6)
  })
})
