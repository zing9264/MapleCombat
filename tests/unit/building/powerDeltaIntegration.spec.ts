// 裝備差值 → 上游戰鬥力公式的整合測試。
//
// powerDelta.spec.ts 只驗「差值算得對不對」；這裡驗的是**接上去之後戰鬥力真的會動**，
// 而且動的幅度正確。基準用合成的簡單數字，好讓期望值可以手算驗證。
import { describe, expect, it } from 'vitest'
import { calculatePower, powerValue, type CombatPowerContext } from '@/core/combatPower'
import type { FieldValues } from '@/core/types'
import { aggregateEquipment, type GearForCompare } from '@/building/core/equipmentDelta'
import { equipmentFieldDelta, statSlotsFor } from '@/building/core/powerDelta'

const MAGE = statSlotsFor('INT', 'LUK')!

const CTX: CombatPowerContext = {
  jobCategory: 'normal',
  jobName: '主教',
  weaponSet: '',
  genesisFinalChecked: false,
  useBuff: false,
  overseasGenesisAtkDelta: 0,
  xenonPowerCoefficientRaw: '',
  daPowerCoefficientRaw: '',
}

/**
 * 刻意用整數且不帶百分比的基準，讓期望值手算得出來：
 *   主屬 1000、攻擊力 100、傷害類全 0
 *   → 戰鬥力 = floor((4×1000 + 0) × (100 × 1 × 1.35 × 1) / 100) = 5400
 */
const BASELINE: FieldValues = {
  baseMain: 1000,
  baseSub: 0,
  atk: 100,
}

function aggregate(items: GearForCompare[]) {
  return aggregateEquipment({ items, setEffects: [], characterLevel: 283 })
}

function powerWith(delta: FieldValues = {}): number {
  return powerValue(calculatePower(BASELINE, CTX, delta))
}

function deltaFor(before: GearForCompare[], after: GearForCompare[]): FieldValues {
  return equipmentFieldDelta(aggregate(before), aggregate(after), MAGE)
}

describe('裝備差值接上戰鬥力公式', () => {
  it('基準本身算得出預期的戰鬥力', () => {
    // 這條先立住，後面的差值才有意義
    expect(powerWith()).toBe(5400)
  })

  it('主屬 +100 讓戰鬥力從 5400 變成 5940', () => {
    // main 1000→1100，(4×1100)×1.35 = 5940
    const delta = deltaFor([], [{ name: '戒指', part: '戒指', base: { int: 100 } }])
    expect(powerWith(delta)).toBe(5940)
  })

  it('魔攻 +100 讓攻擊力翻倍，戰鬥力也翻倍', () => {
    const delta = deltaFor([], [{ name: '武器', part: '長杖', base: { magicPower: 100 } }])
    expect(powerWith(delta)).toBe(10800)
  })

  it('BOSS 傷害 +100% 讓傷害倍率從 1 變成 2', () => {
    const delta = deltaFor([], [{ name: '戒指', part: '戒指', base: { bossDamage: 100 } }])
    expect(powerWith(delta)).toBe(10800)
  })

  it('拔掉裝備會讓戰鬥力下降', () => {
    const delta = deltaFor([{ name: '戒指', part: '戒指', base: { int: 100 } }], [])
    expect(powerWith(delta)).toBeLessThan(5400)
  })

  it('無視防禦率不影響戰鬥力', () => {
    // 它只在實戰公式裡；若不小心算進戰鬥力，這條會變成 > 5400
    const delta = deltaFor([], [{ name: '戒指', part: '戒指', base: { ignoreDefense: 50 } }])
    expect(powerWith(delta)).toBe(5400)
  })

  it('掉一整階套裝效果會反映在戰鬥力上', () => {
    // 兩件永恆法師裝 = 第 2 階（攻擊力/魔力 +40）；換掉一件就整階消失
    const before: GearForCompare[] = [
      { name: '永恆法師長袍', part: '上衣', base: {} },
      { name: '永恆法師褲', part: '褲/裙', base: {} },
    ]
    const after: GearForCompare[] = [
      { name: '永恆法師長袍', part: '上衣', base: {} },
      { name: '自製褲子', part: '褲/裙', base: {} },
    ]

    const withSet = powerWith(deltaFor([], before))
    const withoutSet = powerWith(deltaFor([], after))
    expect(withoutSet).toBeLessThan(withSet)
  })

  it('沒有任何替換時戰鬥力不動', () => {
    const items: GearForCompare[] = [{ name: '戒指', part: '戒指', base: { int: 100 } }]
    expect(powerWith(deltaFor(items, items))).toBe(5400)
  })
})
