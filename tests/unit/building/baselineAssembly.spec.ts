// 把「推導的部分」與「手填的部分」組裝成公式欄位，並對帳。
import { describe, expect, it } from 'vitest'
import {
  NO_PERCENT_PARTS,
  assembleFields,
  combineBaselines,
  equipmentBaseline,
  familiarBaseline,
  flatOnlyEquipmentBaseline,
  panelChecks,
  rebuildPanelValue,
  type BaselineSource,
} from '@/building/core/baseline'
import { aggregateEquipment, type GearForCompare } from '@/building/core/equipmentDelta'
import { statSlotsFor } from '@/building/core/powerDelta'

const MAGE = statSlotsFor('INT', 'LUK')!

function source(over: Partial<BaselineSource>): BaselineSource {
  return { label: 'x', flat: {}, noApply: {}, percent: {}, unrecognized: [], ...over }
}

describe('equipmentBaseline', () => {
  it('裝備固定值進基本數值，會吃 ％ 加成', () => {
    const items: GearForCompare[] = [
      { name: '戒指', part: '戒指', base: { int: 300, magicPower: 50 } },
    ]
    const stats = aggregateEquipment({ items, setEffects: [], characterLevel: 283 })
    const result = equipmentBaseline(stats)

    expect(result.flat.int).toBe(300)
    expect(result.flat.magicPower).toBe(50)
    // 裝備跟符文不同，不會進「％未套用」
    expect(result.noApply).toEqual({})
  })

  it('裝備的百分比會帶過來', () => {
    const items: GearForCompare[] = [{ name: '戒指', part: '戒指', base: { bossDamage: 30 } }]
    const stats = aggregateEquipment({ items, setEffects: [], characterLevel: 283 })
    expect(equipmentBaseline(stats).percent.bossDamage).toBe(30)
  })
})

describe('flatOnlyEquipmentBaseline — 寶石／圖騰不吃 ％', () => {
  it('固定值進 noApply 而不是 flat', () => {
    // 伊妮絲的寶玉 INT 1850 若進 flat，會被乘上主屬 ％（實測約 5 倍），多算七千多
    const items: GearForCompare[] = [{ name: '伊妮絲的寶玉', part: '寶石', base: { int: 1850 } }]
    const stats = aggregateEquipment({ items, setEffects: [], characterLevel: 283 })
    const result = flatOnlyEquipmentBaseline(stats)

    expect(result.noApply.int).toBe(1850)
    expect(result.flat).toEqual({})
  })

  it('圖騰不在此列 —— 遊戲把它算在「裝備道具 基本數值」', () => {
    // 一度誤以為圖騰跟寶石同性質；三項數字同時吻合才確定它吃 ％
    expect(NO_PERCENT_PARTS.has('圖騰')).toBe(false)
  })

  it('NO_PERCENT_PARTS 只涵蓋寶石，一般裝備不受影響', () => {
    expect(NO_PERCENT_PARTS.has('寶石')).toBe(true)
    expect(NO_PERCENT_PARTS.has('上衣')).toBe(false)
    expect(NO_PERCENT_PARTS.has('戒指')).toBe(false)
  })

  it('分開加總後，兩邊相加的固定值總量不變', () => {
    // 只是換分類，不能憑空增減
    const all: GearForCompare[] = [
      { name: '上衣', part: '上衣', base: { int: 300 } },
      { name: '寶玉', part: '寶石', base: { int: 1850 } },
    ]
    const percentAffected = all.filter((item) => !NO_PERCENT_PARTS.has(item.part))
    const flatOnly = all.filter((item) => NO_PERCENT_PARTS.has(item.part))

    const a = equipmentBaseline(
      aggregateEquipment({ items: percentAffected, setEffects: [], characterLevel: 283 }),
    )
    const b = flatOnlyEquipmentBaseline(
      aggregateEquipment({ items: flatOnly, setEffects: [], characterLevel: 283 }),
    )

    expect((a.flat.int ?? 0) + (b.noApply.int ?? 0)).toBe(2150)
  })
})

describe('familiarBaseline', () => {
  it('魔力%／物攻% 是加算的百分比', () => {
    // 遊戲魔攻明細：［% 數值］「裝備道具 75%」與「萌獸 14%」是兩行，相加成 89%
    const source = familiarBaseline(14, 0)
    expect(source.percent.magicPower).toBe(14)
    expect(source.flat).toEqual({})
    expect(source.noApply).toEqual({})
  })

  it('沒有萌獸時是空的', () => {
    expect(familiarBaseline(0, 0).percent).toEqual({})
  })
})

describe('panelChecks — 傷害類', () => {
  it('傷害類整個值就是百分比，直接對帳', () => {
    const fields = { dmg: 71, bossDmg: 454, critDmg: 91.3 }
    const panel = new Map([
      ['傷害', 71],
      ['BOSS怪物傷害', 454],
      ['爆擊傷害', 91.3],
    ])
    const byLabel = Object.fromEntries(panelChecks(fields, MAGE, panel).map((r) => [r.label, r]))

    expect(byLabel['傷害（傷害）'].ok).toBe(true)
    expect(byLabel['BOSS傷害（BOSS怪物傷害）'].ok).toBe(true)
    expect(byLabel['爆擊傷害（爆擊傷害）'].ok).toBe(true)
  })

  it('缺多少就報多少', () => {
    const rows = panelChecks({ dmg: 46 }, MAGE, new Map([['傷害', 71]]))
    expect(rows[0].diff).toBe(-25)
  })
})

describe('assembleFields — 覆寫語意', () => {
  const derived = combineBaselines([
    source({ label: 'AP配點', flat: { int: 1433 } }),
    source({ label: '符文', noApply: { int: 6600 } }),
    source({ label: '極限屬性', flat: { int: 300 }, percent: { damage: 33, critDamage: 10 } }),
    source({ label: '裝備', flat: { int: 3854, magicPower: 2000 }, percent: { int: 628 } }),
  ])

  it('留空就用自動推導的值', () => {
    const fields = assembleFields(derived, {}, MAGE)
    expect(fields.baseMain).toBe(5587)
    expect(fields.percentMain).toBe(628)
    expect(fields.noApplyMain).toBe(6600)
    expect(fields.critDmg).toBe(10)
  })

  it('填了就以填的為準，不是相加', () => {
    // 玩家抄遊戲明細的［套用中的數值］，那就是答案本身
    const fields = assembleFields(derived, { mainFlat: '4265', mainPercent: '89' }, MAGE)
    expect(fields.baseMain).toBe(4265)
    expect(fields.percentMain).toBe(89)
    // 沒填的欄位仍然用推導值
    expect(fields.noApplyMain).toBe(6600)
  })

  it('填 0 與留空意義不同', () => {
    // 「確認沒有」必須壓得過推導值，否則玩家無法表達「這項真的是 0」
    expect(assembleFields(derived, { mainPercent: '0' }, MAGE).percentMain).toBe(0)
    expect(assembleFields(derived, {}, MAGE).percentMain).toBe(628)
  })

  it('傷害類預設直接取面板值，不必手填', () => {
    // 傷害類沒有基底與 ％ 的交互作用，面板值就是答案
    const panel = new Map([
      ['傷害', 71],
      ['BOSS怪物傷害', 464],
      ['爆擊傷害', 104.3],
    ])
    const fields = assembleFields(derived, {}, MAGE, panel)
    expect(fields.dmg).toBe(71)
    expect(fields.bossDmg).toBe(464)
    expect(fields.critDmg).toBe(104.3)
  })

  it('傷害類也能被手填覆寫', () => {
    const panel = new Map([['傷害', 71]])
    expect(assembleFields(derived, { damage: '29' }, MAGE, panel).dmg).toBe(29)
  })

  it('沒有面板資料時退回推導值', () => {
    expect(assembleFields(derived, {}, MAGE).dmg).toBe(33)
  })

  it('技能欄位會傳給公式去扣掉，沒填就是 0', () => {
    // 遊戲戰鬥力不算技能加成：實測不扣高 31%，扣掉只差 1.9%
    const fields = assembleFields(derived, { mainSkillFlat: '431', mainSkillPercent: '10' }, MAGE)
    expect(fields.skillBaseMain).toBe(431)
    expect(fields.skillPercentMain).toBe(10)
    expect(fields.skillAtk).toBe(0)
  })

  it('技能不影響基底欄位本身', () => {
    // 扣除是公式內部做的；basemain 仍應是［套用中的數值］
    const fields = assembleFields(derived, { mainFlat: '5904', mainSkillFlat: '431' }, MAGE)
    expect(fields.baseMain).toBe(5904)
  })

  it('法師讀魔攻，副屬讀 LUK', () => {
    const fields = assembleFields(derived, {}, MAGE)
    expect(fields.atk).toBe(2000)
    expect(fields.baseSub).toBe(0)
  })

  it('戰士會讀 STR 與物攻，而不是法師那組', () => {
    const warrior = statSlotsFor('STR', 'DEX')!
    const fields = assembleFields(derived, {}, warrior)
    expect(fields.baseMain).toBe(0)
    expect(fields.atk).toBe(0)
  })
})

describe('panelChecks — 對帳', () => {
  const slots = MAGE

  it('重建值與面板相符時 ok', () => {
    // 基底 1000、+100%、未套用 500 → 2500
    const fields = { baseMain: 1000, percentMain: 100, noApplyMain: 500 }
    const panel = new Map([['INT', 2500]])

    const [check] = panelChecks(fields, slots, panel)
    expect(check.ok).toBe(true)
    expect(check.diff).toBe(0)
    expect(check.label).toBe('主屬（INT）')
  })

  it('對不上時回報差多少', () => {
    // 這正是手填打錯一位數時該被抓到的情況
    const fields = { baseMain: 1000, percentMain: 100, noApplyMain: 0 }
    const panel = new Map([['INT', 2500]])

    const [check] = panelChecks(fields, slots, panel)
    expect(check.ok).toBe(false)
    expect(check.rebuilt).toBe(2000)
    expect(check.diff).toBe(-500)
  })

  it('面板沒有那個欄位就略過，不要硬湊', () => {
    const fields = { baseMain: 1000 }
    expect(panelChecks(fields, slots, new Map())).toEqual([])
  })

  it('法師查的是魔法攻擊力', () => {
    const fields = { atk: 100, percentAtk: 0, noApplyAtk: 0 }
    const panel = new Map([
      ['魔法攻擊力', 100],
      ['攻擊力', 999],
    ])

    const labels = panelChecks(fields, slots, panel).map((c) => c.label)
    expect(labels).toContain('攻擊力（魔法攻擊力）')
  })

  it('取整與 rebuildPanelValue 一致', () => {
    const fields = { baseMain: 1733, percentMain: 628, noApplyMain: 24200 }
    const panel = new Map([['INT', rebuildPanelValue(1733, 628, 24200)]])
    expect(panelChecks(fields, slots, panel)[0].ok).toBe(true)
  })
})

describe('終傷（famFinal / famFinalSources 必須一致）', () => {
  it('萌獸終傷會進 famFinal，而不是只放在來源表上', () => {
    // 上游 resolveFamMult(sources, famFinal) 把 sources 當成 famFinal 的拆解，
    // 差額會被補成一條額外來源。famFinal 留 0 時它會補一條 −20% 抵銷掉萌獸，
    // 終傷完全不生效、畫面卻照樣顯示 20% —— 實際踩過這個坑。
    const derived = combineBaselines([familiarBaseline(14, 0, 20)])
    expect(derived.finalDamage).toBe(20)
    expect(assembleFields(derived, {}, MAGE).famFinal).toBe(20)
  })

  it('手填的「萌獸以外」終傷會加上去', () => {
    const derived = combineBaselines([familiarBaseline(0, 0, 20)])
    expect(assembleFields(derived, {}, MAGE).famFinal).toBe(20)
  })

  it('沒有萌獸時是 0，不是 undefined', () => {
    expect(assembleFields(combineBaselines([]), {}, MAGE).famFinal).toBe(0)
  })
})
