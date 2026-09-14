// 萌獸的合計與詞條換算。
//
// 測資照遊戲畫面來：暗黑半人馬（傳說）的三條是
// 加持技能持續時間 +50%、魔法攻擊力 +14%、最終傷害 +20%。
import { describe, expect, it } from 'vitest'
import { summarize, type Familiar, type FamiliarLine } from '@/building/stores/familiar'
import { familiarEffect, familiarLineText } from '@/building/data/familiarLines'

function make(
  id: string,
  lines: Array<[string, number]>,
  slot: Familiar['slot'] = 'summon',
): Familiar {
  const filled: FamiliarLine[] = lines.map(([name, value]) => ({ name, value }))
  while (filled.length < 3) filled.push({ name: '', value: 0 })
  return { id, name: id, grade: '傳說', lines: filled, slot }
}

describe('familiarEffect — 哪些詞條進得了戰鬥力', () => {
  it('終傷、攻擊力%、屬性% 認得', () => {
    expect(familiarEffect('最終傷害%', 20)).toEqual({ kind: 'finalDamage', value: 20 })
    expect(familiarEffect('魔法攻擊力%', 14)).toEqual({
      kind: 'attackPercent',
      value: 14,
      magic: true,
    })
    expect(familiarEffect('INT%', 20)).toEqual({ kind: 'statPercent', value: 20, stat: 'int' })
  })

  it('不在戰鬥力公式裡的一律回 null —— 不是漏掉，是確定不算', () => {
    for (const name of ['加持技能持續時間', '爆擊機率%', '無視怪物防禦率%', '增加被動技能等級']) {
      expect(familiarEffect(name, 50)).toBeNull()
    }
  })

  it('固定值不算：萌獸給的是萌獸自己的數值，不是角色的', () => {
    expect(familiarEffect('魔法攻擊力', 25)).toBeNull()
    expect(familiarEffect('INT', 25)).toBeNull()
  })

  it('數值是 0 就沒有效果', () => {
    expect(familiarEffect('最終傷害%', 0)).toBeNull()
  })
})

describe('familiarLineText', () => {
  it('照模板套上玩家填的數字', () => {
    expect(familiarLineText('魔法攻擊力%', 14)).toBe('魔法攻擊力 +14%')
    expect(familiarLineText('最終傷害%', 20)).toBe('最終傷害 +20%')
  })

  it('不認得的詞條原樣回傳，不要吞掉', () => {
    expect(familiarLineText('某個新詞條', 5)).toBe('某個新詞條')
  })
})

describe('summarize', () => {
  it('暗黑半人馬：只有魔攻% 與終傷 進得了公式', () => {
    const totals = summarize([
      make('暗黑半人馬', [
        ['加持技能持續時間', 50],
        ['魔法攻擊力%', 14],
        ['最終傷害%', 20],
      ]),
    ])

    expect(totals.finalDamageSources).toEqual([20])
    expect(totals.magicPowerPercent).toBe(14)
    expect(totals.multiplier).toBeCloseTo(1.2, 6)
  })

  it('同一隻可以有重複的詞條（巡邏機器人兩條都是加持時間）', () => {
    const totals = summarize([
      make('巡邏機器人', [
        ['加持技能持續時間', 50],
        ['加持技能持續時間', 50],
        ['增加被動技能等級', 2],
      ]),
    ])
    expect(totals.finalDamageSources).toEqual([])
    expect(totals.multiplier).toBe(1)
  })

  it('終傷逐條收進來源，不先加總', () => {
    // 每一條終傷都是獨立的一筆，怎麼合成交給 famMultFromSources 決定
    const totals = summarize([
      make('a', [['最終傷害%', 20]]),
      make('b', [['最終傷害%', 20]], 'bond'),
      make('c', [['最終傷害%', 2]], 'bond'),
    ])
    expect(totals.finalDamageSources).toEqual([20, 20, 2])
    expect(totals.finalDamageTotal).toBe(42)
  })

  it('魔攻% 與物攻% 分開累計，不互相污染', () => {
    const totals = summarize([
      make('a', [
        ['魔法攻擊力%', 14],
        ['物理攻擊力%', 14],
      ]),
    ])
    expect(totals.magicPowerPercent).toBe(14)
    expect(totals.attackPowerPercent).toBe(14)
  })

  it('屬性% 依屬性分開記，全屬性% 另計', () => {
    const totals = summarize([
      make('a', [
        ['LUK%', 14],
        ['INT%', 20],
        ['全屬性%', 12],
      ]),
    ])
    expect(totals.statPercent.luk).toBe(14)
    expect(totals.statPercent.int).toBe(20)
    expect(totals.statPercent.str).toBe(0)
    expect(totals.allStatPercent).toBe(12)
  })

  it('空清單是 ×1，不是 0', () => {
    expect(summarize([]).multiplier).toBe(1)
    expect(summarize([]).finalDamageTotal).toBe(0)
  })
})

describe('換萌獸的倍率比值', () => {
  it('拿掉一隻有終傷的，比值就是換裝要乘的係數', () => {
    // 裝備變更頁把這個比值丟進上游的 __eqFamFinalMultiplierFactor
    const before = summarize([
      make('a', [['最終傷害%', 20]]),
      make('b', [['最終傷害%', 20]], 'bond'),
    ])
    const after = summarize([make('b', [['最終傷害%', 20]], 'bond')])

    expect(before.multiplier).toBeCloseTo(1.4, 6)
    expect(after.multiplier).toBeCloseTo(1.2, 6)
    expect(after.multiplier / before.multiplier).toBeCloseTo(1.2 / 1.4, 6)
  })
})

describe('終傷的合成方式（遊戲實測）', () => {
  /*
   * 遊戲內「最終傷害」tooltip 寫著：
   *   「以萌獸屬性套用的最終傷害彼此之間會進行加總，最後會相乘套用並計算。」
   *
   * 藍色緞帶肥肥（稀有）兩條都是最終傷害 +8%，面板的［套用中的數值］顯示
   * 「萌獸：16.00%」—— 相加，不是相乘（相乘會是 16.64%）。
   */
  it('同一隻的兩條 8% 相加成 16%，不是相乘成 16.64%', () => {
    const totals = summarize([
      make('藍色緞帶肥肥', [
        ['最終傷害%', 8],
        ['最終傷害%', 8],
        ['攻擊時有一定的機率發動一定等級的冰結效果', 5],
      ]),
    ])

    expect(totals.finalDamageSources).toEqual([8, 8])
    expect(totals.finalDamageTotal).toBe(16)
    // 面板顯示 16.00%
    expect((totals.multiplier - 1) * 100).toBeCloseTo(16, 4)
    expect(totals.multiplier).not.toBeCloseTo(1.08 * 1.08, 4)
  })

  it('萌獸的合計會再與技能終傷相乘 —— 面板 286.85% 的來源', () => {
    // (1 + 技能 233.49%) × (1 + 萌獸 16%) = 3.86848 → 最終傷害 286.85%
    const familiar = summarize([
      make('藍色緞帶肥肥', [
        ['最終傷害%', 8],
        ['最終傷害%', 8],
      ]),
    ])
    const panel = (1 + 233.49 / 100) * familiar.multiplier
    expect((panel - 1) * 100).toBeCloseTo(286.85, 2)
  })
})
