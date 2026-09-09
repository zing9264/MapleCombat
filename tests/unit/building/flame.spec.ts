import { describe, expect, it } from 'vitest'
import { flameValue, sumFlames, supportsFlameType, type FlameContext } from '@/building/core/flame'

/**
 * 每個數字都對照過玩家實際裝備的 item_add_option。
 * 星火公式抄自 KMS 的開源函式庫，TMS 是否沿用同一套必須用實際資料證明。
 */

const ETERNAL_PANTS: FlameContext = { reqLevel: 250, isWeapon: false }
const GENESIS_STAFF: FlameContext = {
  reqLevel: 200,
  isWeapon: true,
  bossReward: true,
  baseAttackPower: 251,
  baseMagicPower: 406,
}

describe('永恆法師褲 Lv.250 — 星火 STR21 / DEX26 / INT71 / LUK0', () => {
  // 這四條加起來剛好是星火上限，能完整還原遊戲數值
  const LINES = [
    { type: 'int', grade: 3 },
    { type: 'str_int', grade: 3 },
    { type: 'dex_int', grade: 2 },
    { type: 'dex', grade: 1 },
  ] as const

  it('250 等的單屬性係數是 12（不 +1 的特例）', () => {
    expect(flameValue('int', 1, ETERNAL_PANTS)).toBe(12)
    expect(flameValue('int', 3, ETERNAL_PANTS)).toBe(36)
  })

  it('250 等的雙屬性係數是 7', () => {
    expect(flameValue('str_int', 1, ETERNAL_PANTS)).toBe(7)
    expect(flameValue('str_int', 3, ETERNAL_PANTS)).toBe(21)
  })

  it('四條加總與遊戲完全一致', () => {
    const total = sumFlames([...LINES], ETERNAL_PANTS)
    expect(total.str).toBe(21)
    expect(total.dex).toBe(26)
    expect(total.int).toBe(71)
    expect(total.luk ?? 0).toBe(0)
  })
})

describe('創世長杖 Lv.200 — BOSS 掉落武器的攻擊力星火', () => {
  it('魔力星火 3 階是 74', () => {
    // ceil(406 × 1 × 6 × 3 / 100) = 74；基準取魔力因為魔力(406) > 攻擊力(251)
    expect(flameValue('magicPower', 3, GENESIS_STAFF)).toBe(74)
  })

  it('BOSS 掉落與一般武器的係數完全不同', () => {
    const normal: FlameContext = { ...GENESIS_STAFF, bossReward: false }
    expect(flameValue('magicPower', 3, normal)).not.toBe(74)
    // 一般武器 3 階：ceil(406 × 3.63 × 4 / 100) = 59
    expect(flameValue('magicPower', 3, normal)).toBe(59)
  })

  it('BOSS 武器 1、2 階不會出攻擊力星火（係數為 0）', () => {
    expect(flameValue('magicPower', 1, GENESIS_STAFF)).toBe(0)
    expect(flameValue('magicPower', 2, GENESIS_STAFF)).toBe(0)
  })
})

describe('其他星火種類', () => {
  const armor160: FlameContext = { reqLevel: 160, isWeapon: false }

  it('防具的攻擊力／魔力星火就等於階級', () => {
    expect(flameValue('attackPower', 5, armor160)).toBe(5)
    expect(flameValue('magicPower', 7, armor160)).toBe(7)
  })

  it('全屬性 % 等於階級', () => {
    expect(flameValue('allStat', 3, armor160)).toBe(3)
  })

  it('BOSS 傷害是階級的兩倍，且只有武器能出', () => {
    expect(flameValue('bossDamage', 3, GENESIS_STAFF)).toBe(6)
    expect(supportsFlameType('bossDamage', armor160)).toBe(false)
    expect(supportsFlameType('bossDamage', GENESIS_STAFF)).toBe(true)
  })

  it('MaxHP 依等級分段，250 等以上固定 700 × 階級', () => {
    expect(flameValue('maxHp', 1, armor160)).toBe(480) // floor(160/10) × 30
    expect(flameValue('maxHp', 1, ETERNAL_PANTS)).toBe(700)
    expect(flameValue('maxHp', 3, ETERNAL_PANTS)).toBe(2100)
  })

  it('需求等級降低最多降到 0', () => {
    expect(flameValue('reqLevelDecrease', 3, armor160)).toBe(15)
    expect(flameValue('reqLevelDecrease', 7, { reqLevel: 20, isWeapon: false })).toBe(20)
  })

  it('武器不能出移動速度與跳躍力，防具不能出傷害%', () => {
    expect(supportsFlameType('speed', GENESIS_STAFF)).toBe(false)
    expect(supportsFlameType('speed', armor160)).toBe(true)
    expect(supportsFlameType('damage', armor160)).toBe(false)
  })
})

describe('sumFlames', () => {
  const ctx: FlameContext = { reqLevel: 200, isWeapon: false }

  it('雙屬性會同時加兩項', () => {
    const total = sumFlames([{ type: 'int_luk', grade: 4 }], ctx)
    // Lv.200 雙屬係數 = floor(200/40)+1 = 6
    expect(total.int).toBe(24)
    expect(total.luk).toBe(24)
  })

  it('超過四條的部分會被忽略', () => {
    const five = Array.from({ length: 5 }, () => ({ type: 'int', grade: 1 }) as const)
    // Lv.200 單屬係數 = floor(200/20)+1 = 11
    expect(sumFlames(five, ctx).int).toBe(44)
  })

  it('空清單回傳空物件', () => {
    expect(sumFlames([], ctx)).toEqual({})
  })
})
