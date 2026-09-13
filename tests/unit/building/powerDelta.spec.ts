import { describe, expect, it } from 'vitest'
import { aggregateEquipment, type GearForCompare } from '@/building/core/equipmentDelta'
import { equipmentFieldDelta, isEmptyDelta, statSlotsFor } from '@/building/core/powerDelta'

const LEVEL = 283

function aggregate(items: GearForCompare[]) {
  return aggregateEquipment({ items, setEffects: [], characterLevel: LEVEL })
}

/** 主教：主 INT、副 LUK、吃魔法攻擊力 */
const MAGE = statSlotsFor('INT', 'LUK')!

describe('statSlotsFor', () => {
  it('法系吃魔法攻擊力', () => {
    expect(statSlotsFor('INT', 'LUK')).toEqual({ main: 'int', sub: 'luk', attack: 'magicPower' })
  })

  it('戰士吃攻擊力', () => {
    expect(statSlotsFor('STR', 'DEX')).toEqual({ main: 'str', sub: 'dex', attack: 'attackPower' })
  })

  it('盜賊主屬 LUK、副屬 DEX', () => {
    expect(statSlotsFor('LUK', 'DEX')).toEqual({ main: 'luk', sub: 'dex', attack: 'attackPower' })
  })

  it('主屬是 HP 的職業回傳 null，讓呼叫端明確不支援', () => {
    // 惡魔復仇者走的是 equivalentMain 那條路，悄悄算成 0 會給出錯的差值
    expect(statSlotsFor('HP', 'STR')).toBeNull()
  })
})

describe('equipmentFieldDelta', () => {
  it('沒有變動時全部是 0', () => {
    const items: GearForCompare[] = [{ name: 'a', part: '上衣', base: { int: 100 } }]
    const delta = equipmentFieldDelta(aggregate(items), aggregate(items), MAGE)
    expect(isEmptyDelta(delta)).toBe(true)
  })

  it('主屬固定值的增加會進 baseMain', () => {
    const before = aggregate([{ name: 'a', part: '上衣', base: { int: 100 } }])
    const after = aggregate([{ name: 'b', part: '上衣', base: { int: 340 } }])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(delta.baseMain).toBe(240)
    expect(delta.percentMain).toBe(0)
  })

  it('魔攻進 atk，而不是留在 magicPower 欄位', () => {
    const before = aggregate([{ name: 'a', part: '上衣', base: { magicPower: 6 } }])
    const after = aggregate([{ name: 'b', part: '上衣', base: { magicPower: 130 } }])

    expect(equipmentFieldDelta(before, after, MAGE).atk).toBe(124)
  })

  it('戰士換的是攻擊力，魔攻不影響', () => {
    const warrior = statSlotsFor('STR', 'DEX')!
    const before = aggregate([
      { name: 'a', part: '上衣', base: { attackPower: 10, magicPower: 99 } },
    ])
    const after = aggregate([{ name: 'b', part: '上衣', base: { attackPower: 40, magicPower: 0 } }])

    expect(equipmentFieldDelta(before, after, warrior).atk).toBe(30)
  })

  it('全屬性會攤到主副屬性上', () => {
    // aggregateEquipment 把 allStat 攤成四項屬性，這裡要跟著反映
    const before = aggregate([])
    const after = aggregate([{ name: 'b', part: '戒指', base: { allStat: 10 } }])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(delta.percentMain).toBe(10)
    expect(delta.percentSub).toBe(10)
  })

  it('BOSS 傷害與爆擊傷害各自進對應欄位', () => {
    const before = aggregate([])
    const after = aggregate([
      { name: 'b', part: '戒指', base: { bossDamage: 30 }, potentials: ['爆擊傷害 +8%'] },
    ])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(delta.bossDmg).toBe(30)
    expect(delta.critDmg).toBe(8)
  })

  it('無視防禦率不進戰鬥力差值', () => {
    // 無視防禦只在實戰公式（actualDamage），算進戰鬥力會憑空多出變化
    const before = aggregate([])
    const after = aggregate([{ name: 'b', part: '戒指', base: { ignoreDefense: 30 } }])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(isEmptyDelta(delta)).toBe(true)
  })

  it('防禦力與 MaxHP 也不進戰鬥力差值', () => {
    const before = aggregate([])
    const after = aggregate([
      { name: 'b', part: '上衣', base: { armor: 500, maxHp: 2000, maxMp: 2000 } },
    ])

    expect(isEmptyDelta(equipmentFieldDelta(before, after, MAGE))).toBe(true)
  })

  it('拔掉裝備會得到負的差值', () => {
    const before = aggregate([{ name: 'a', part: '上衣', base: { int: 300, magicPower: 50 } }])
    const after = aggregate([])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(delta.baseMain).toBe(-300)
    expect(delta.atk).toBe(-50)
  })

  it('套裝階層的得失會一併反映', () => {
    // 兩件永恆法師裝 = 第 2 階（攻擊力/魔力 +40、BOSS傷害 +10%）；
    // 換掉一件就整階消失，這部分也必須出現在差值裡
    const before = aggregate([
      { name: '永恆法師長袍', part: '上衣', base: {} },
      { name: '永恆法師褲', part: '褲/裙', base: {} },
    ])
    const after = aggregate([
      { name: '永恆法師長袍', part: '上衣', base: {} },
      { name: '自製褲子', part: '褲/裙', base: {} },
    ])

    const delta = equipmentFieldDelta(before, after, MAGE)
    expect(delta.atk).toBe(-40)
    expect(delta.bossDmg).toBe(-10)
  })
})
