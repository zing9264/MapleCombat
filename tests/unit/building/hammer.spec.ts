// 白金鐵鎚。
import { describe, expect, it } from 'vitest'
import { expectedHammers, reachChance } from '@/building/data/hammer'

describe('reachChance', () => {
  it('不敲就是 100%', () => {
    expect(reachChance(0)).toBe(1)
  })

  it('逐階相乘：50% → 12.5% → 1.25%', () => {
    expect(reachChance(1)).toBeCloseTo(0.5, 10)
    expect(reachChance(2)).toBeCloseTo(0.125, 10)
    expect(reachChance(3)).toBeCloseTo(0.0125, 10)
  })

  it('敲滿 5 次是十萬分之一等級', () => {
    expect(reachChance(5)).toBeCloseTo(0.0000125, 12)
  })
})

describe('expectedHammers', () => {
  it('失敗不退階，所以每階期望支數是成功率倒數', () => {
    // 2 + 4 + 10 + 20 + 50
    expect(expectedHammers(1)).toBe(2)
    expect(expectedHammers(3)).toBe(16)
    expect(expectedHammers(5)).toBe(86)
  })
})
