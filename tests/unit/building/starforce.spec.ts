import { describe, expect, it } from 'vitest'
import {
  computeStarforce,
  gearKindOf,
  inferItemJob,
  maxStarFor,
  partGainsMaxHp,
  type NumericOption,
} from '@/building/core/starforce'
import realItems from './fixtures/starforce-real-items.json'

/**
 * 這些 fixture 是 283 級主教「藜樂拌楓糖」身上 19 件有星力的裝備，
 * base / upgrade / expected 全部直接取自 API 的 item_base_option、
 * item_etc_option、item_starforce_option。
 *
 * 這是星力表最重要的防線：數值表雖然抄自 KMS 的開源函式庫，但 TMS 是否沿用
 * 同一套規則必須用實際資料證明，不能假設。
 */
interface RealItem {
  name: string
  part: string
  star: number
  reqLevel: number
  base: NumericOption
  upgrade: NumericOption
  expected: NumericOption
}

const ITEMS = realItems as RealItem[]
const WEAPON_PARTS = new Set(['長杖'])

/** 影響傷害的欄位。防禦力不影響戰鬥力，另外處理 */
const DAMAGE_FIELDS = ['str', 'dex', 'int', 'luk', 'attackPower', 'magicPower', 'maxHp'] as const

function compute(item: RealItem): NumericOption {
  return computeStarforce({
    reqLevel: item.reqLevel,
    star: item.star,
    job: inferItemJob(item.part, 'magician'),
    kind: gearKindOf(item.part, WEAPON_PARTS.has(item.part)),
    gainsMaxHp: partGainsMaxHp(item.part),
    base: item.base,
    upgrade: item.upgrade,
  })
}

describe('computeStarforce — 對照實際裝備的 item_starforce_option', () => {
  it('fixture 有 19 件裝備', () => {
    expect(ITEMS).toHaveLength(19)
  })

  it.each(ITEMS.map((i) => [`${i.part} ${i.name} ★${i.star} Lv.${i.reqLevel}`, i] as const))(
    '%s 的傷害相關數值全部吻合',
    (_label, item) => {
      const got = compute(item)
      for (const field of DAMAGE_FIELDS) {
        expect(got[field] ?? 0, field).toBe(item.expected[field] ?? 0)
      }
    },
  )
})

describe('關鍵規則（每條都由實測反推）', () => {
  it('飾品是共用裝，四項屬性從 1 星就全加', () => {
    // 頂級培羅德烙印墜飾 Lv.150 ★17：STR/DEX 也拿到 1~17 星的完整加成
    const item = ITEMS.find((i) => i.name === '頂級培羅德烙印墜飾')!
    const got = compute(item)
    expect(got.str).toBe(got.int)
    expect(inferItemJob('墜飾', 'magician')).toBe('beginner')
  })

  it('防具是職業專用，非主副屬性 16 星後才加', () => {
    // 航海師法師護肩 Lv.160 ★18：STR/DEX 只拿到 16~18 星（13×3 = 39）
    const item = ITEMS.find((i) => i.name === '航海師法師護肩')!
    const got = compute(item)
    expect(got.str).toBe(39)
    expect(got.int).toBeGreaterThan(got.str!)
    expect(inferItemJob('肩膀裝飾', 'magician')).toBe('magician')
  })

  it('機器心臟算共用裝，且不吃防禦力加成', () => {
    const item = ITEMS.find((i) => i.name === '菇菇機器人專用心臟')!
    const got = compute(item)
    expect(got.str).toBe(item.expected.str)
    expect(got.armor ?? 0).toBe(0)
  })

  it('武器 16 星起才給攻擊力，之前依累積值遞增', () => {
    const item = ITEMS.find((i) => i.part === '長杖')!
    const got = compute(item)
    expect(got.magicPower).toBe(item.expected.magicPower)
  })

  it('Lv.250 / 22 星的主屬性是 159（2×5 + 3×10 + 17×7）', () => {
    const item = ITEMS.find((i) => i.name === '永恆法師褲')!
    expect(compute(item).int).toBe(159)
  })
})

describe('maxStarFor', () => {
  it('138 等以上開放到 30 星', () => {
    expect(maxStarFor(250)).toBe(30)
    expect(maxStarFor(140)).toBe(30)
  })

  it('低等級裝備的上限', () => {
    expect(maxStarFor(130)).toBe(20)
    expect(maxStarFor(120)).toBe(15)
    expect(maxStarFor(50)).toBe(5)
  })

  it('超過上限的星數會被夾住', () => {
    const capped = computeStarforce({
      reqLevel: 50,
      star: 30,
      job: 'magician',
      kind: 'armor',
      base: { int: 10 },
    })
    const atCap = computeStarforce({
      reqLevel: 50,
      star: 5,
      job: 'magician',
      kind: 'armor',
      base: { int: 10 },
    })
    expect(capped.int).toBe(atCap.int)
  })

  it('0 星回傳空物件', () => {
    expect(
      computeStarforce({ reqLevel: 200, star: 0, job: 'magician', kind: 'armor', base: {} }),
    ).toEqual({})
  })
})

describe('已知差異：兩顆戒指的防禦力', () => {
  // 巨大的恐怖（★22）與天上的氣息（★25）的防禦力都比推算多 2 點。
  // 兩者的 base / 卷軸 / 火花 防禦力皆為 0，累加公式 floor(armor/20)+1 推不出這 2 點。
  // 防禦力不影響戰鬥力，先記錄不修；若日後要顯示絕對防禦力再回頭查。
  it('差異僅出現在防禦力，且只有這兩件', () => {
    const mismatched = ITEMS.filter(
      (item) => (compute(item).armor ?? 0) !== (item.expected.armor ?? 0),
    )
    expect(mismatched.map((i) => i.name).sort()).toEqual(['天上的氣息', '巨大的恐怖'])
    for (const item of mismatched) {
      expect(item.expected.armor! - (compute(item).armor ?? 0)).toBe(2)
    }
  })
})
