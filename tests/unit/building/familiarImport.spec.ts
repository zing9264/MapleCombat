// 從 API 匯入萌獸。
//
// 這條路徑決定戰鬥力吃到的萌獸數值，而且是「遊戲真實狀態 → 我們的模型」的
// 唯一入口，所以對應表的每一條都要有測試守著。
import { describe, expect, it } from 'vitest'
import { familiarIdFor, familiarsFromApi } from '@/building/core/familiarImport'
import { MAX_BOND_SLOTS } from '@/building/stores/familiar'
import { familiarEffect, familiarLineDef, familiarLineFromApi } from '@/building/data/familiarLines'
import type { FamiliarData, FamiliarEntry } from '@/building/services/nexonApi'

/**
 * 實測 /character/familiar 回應裡出現過的全部 option_name（171 隻、36 種）。
 *
 * 這份清單是迴歸測試的核心：對不到的名稱會被原樣保留，familiarEffect() 回 null，
 * 於是那條詞條「安靜地」不計入戰鬥力 —— 不會報錯，只會算錯。
 */
const API_OPTION_NAMES = [
  '4秒內恢復 HP',
  '4秒內恢復 MP',
  'DEX',
  'DEX (%)',
  'INT',
  'INT (%)',
  'LUK',
  'LUK (%)',
  'MaxHP',
  'MaxHP (%)',
  'MaxMP',
  'MaxMP (%)',
  'STR',
  'STR (%)',
  '中毒效果',
  '依照被動技能來增加',
  '依照角色全部屬性來追加萌獸的攻擊力 (%)',
  '依照角色攻擊力來追加萌獸的攻擊力 (%)',
  '全屬性',
  '全屬性 (%)',
  '冰結效果',
  '加持技能持續時間 (%)',
  '封印效果',
  '攻擊時有3%機率恢復 HP',
  '攻擊時有3%機率恢復 MP',
  '暈眩效果',
  '最終傷害 (%)',
  '爆擊機率 (%)',
  '物理攻擊力',
  '物理攻擊力 (%)',
  '緩慢效果',
  '闇黑效果',
  '防禦力',
  '防禦力 (%)',
  '魔法攻擊力',
  '魔法攻擊力 (%)',
]

function entry(patch: Partial<FamiliarEntry> = {}): FamiliarEntry {
  return {
    familiar_name: '暗黑半人馬',
    familiar_nickname: '暗黑半人馬',
    familiar_state: 'registered',
    familiar_grade: '爆擊機率',
    familiar_level: 5,
    option_level: 5,
    summoned_flag: 'false',
    slot_id: 'not link',
    option: [
      { option_no: 1, option_name: '加持技能持續時間 (%)', option_value: '50' },
      { option_no: 2, option_name: '魔法攻擊力 (%)', option_value: '14' },
      { option_no: 3, option_name: '最終傷害 (%)', option_value: '20' },
    ],
    ...patch,
  }
}

const data = (entries: FamiliarEntry[]): FamiliarData => ({ linkSlots: [], entries })

describe('familiarLineFromApi', () => {
  it('API 出現過的每一種名稱都要對得到本地詞條', () => {
    const unmapped = API_OPTION_NAMES.filter((name) => !familiarLineDef(familiarLineFromApi(name)))
    expect(unmapped).toEqual([])
  })

  it('「(%)」的寫法差異靠規則處理，不用一條條列', () => {
    expect(familiarLineFromApi('最終傷害 (%)')).toBe('最終傷害%')
    expect(familiarLineFromApi('魔法攻擊力 (%)')).toBe('魔法攻擊力%')
    expect(familiarLineFromApi('魔法攻擊力')).toBe('魔法攻擊力')
  })

  it('名稱裡寫死數字的那幾條走對應表', () => {
    expect(familiarLineFromApi('4秒內恢復 HP')).toBe('一定秒數內恢復HP')
    expect(familiarLineFromApi('攻擊時有3%機率恢復 MP')).toBe('攻擊時有一定的機率恢復MP')
    expect(familiarLineFromApi('中毒效果')).toBe('攻擊時有一定的機率發動一定等級的中毒效果')
    expect(familiarLineFromApi('依照被動技能來增加')).toBe('增加被動技能等級')
  })

  it('對不到的原樣回傳，不要吞掉', () => {
    expect(familiarLineFromApi('某個新詞條')).toBe('某個新詞條')
  })

  it('傷害類詞條轉完之後真的進得了公式', () => {
    expect(familiarEffect(familiarLineFromApi('最終傷害 (%)'), 20)).toEqual({
      kind: 'finalDamage',
      value: 20,
    })
    expect(familiarEffect(familiarLineFromApi('魔法攻擊力 (%)'), 14)).toEqual({
      kind: 'attackPercent',
      value: 14,
      magic: true,
    })
  })
})

describe('familiarsFromApi', () => {
  it('暗黑半人馬轉出來就是遊戲畫面上的數值 —— 不用玩家自己抄', () => {
    const [familiar] = familiarsFromApi(data([entry({ summoned_flag: 'true' })]))

    expect(familiar.name).toBe('暗黑半人馬')
    expect(familiar.slot).toBe('summon')
    expect(familiar.lines).toEqual([
      { name: '加持技能持續時間', value: 50 },
      { name: '魔法攻擊力%', value: 14 },
      { name: '最終傷害%', value: 20 },
    ])
  })

  it('slot_id 不是 "not link" 就是羈絆', () => {
    const [familiar] = familiarsFromApi(data([entry({ slot_id: '2' })]))
    expect(familiar.slot).toBe('bond')
  })

  it('沒上場的兩個欄位都是預設值', () => {
    const [familiar] = familiarsFromApi(data([entry()]))
    expect(familiar.slot).toBeNull()
  })

  // 兩個欄位理論上不會同時成立，真的撞上時召喚中只有一格、比較不會是誤讀
  it('同時被標成召喚中與羈絆時以召喚中為準', () => {
    const [familiar] = familiarsFromApi(data([entry({ summoned_flag: 'true', slot_id: '1' })]))
    expect(familiar.slot).toBe('summon')
  })

  it('沒登錄的不收 —— 收進來只會讓清單多出不影響數值的項目', () => {
    expect(familiarsFromApi(data([entry({ familiar_state: 'unregistered' })]))).toEqual([])
  })

  it('id 由名稱衍生，重新同步時認得出是同一隻', () => {
    const first = familiarsFromApi(data([entry()]))
    const second = familiarsFromApi(data([entry({ summoned_flag: 'true' })]))
    expect(first[0].id).toBe(second[0].id)
    expect(first[0].id).toBe(familiarIdFor('暗黑半人馬'))
  })

  it('詞條不足三條時補空，超過時裁掉', () => {
    const [few] = familiarsFromApi(
      data([entry({ option: [{ option_no: 1, option_name: '最終傷害 (%)', option_value: '8' }] })]),
    )
    expect(few.lines).toHaveLength(3)
    expect(few.lines[1]).toEqual({ name: '', value: 0 })
  })

  it('option_no 亂序時照順序排回來', () => {
    const [familiar] = familiarsFromApi(
      data([
        entry({
          option: [
            { option_no: 3, option_name: '最終傷害 (%)', option_value: '20' },
            { option_no: 1, option_name: '魔法攻擊力 (%)', option_value: '14' },
          ],
        }),
      ]),
    )
    expect(familiar.lines[0].name).toBe('魔法攻擊力%')
    expect(familiar.lines[1].name).toBe('最終傷害%')
  })

  it('羈絆分類帶過來，方便在一百多隻裡面找', () => {
    const [familiar] = familiarsFromApi(data([entry()]))
    expect(familiar.category).toBe('爆擊機率')
  })

  it('同名的只留一筆', () => {
    expect(familiarsFromApi(data([entry(), entry()]))).toHaveLength(1)
  })

  it('沒有資料時回空陣列，不要炸掉', () => {
    expect(familiarsFromApi(undefined)).toEqual([])
    expect(familiarsFromApi(data([]))).toEqual([])
  })
})

describe('位置上限', () => {
  // 匯入是直接寫進 store 的，繞過 setSlot() 的檢查。API 照理不會回不合法的狀態，
  // 但真的回了的話，後果是安靜地算錯：summoned 只取第一隻、active 卻兩隻都算。
  it('召喚中超過一隻時只留第一隻', () => {
    const result = familiarsFromApi(
      data([
        entry({ familiar_name: 'a', summoned_flag: 'true' }),
        entry({ familiar_name: 'b', summoned_flag: 'true' }),
      ]),
    )
    expect(result.map((f) => f.slot)).toEqual(['summon', null])
  })

  it('羈絆超過上限時多的撤下來', () => {
    const result = familiarsFromApi(
      data(
        Array.from({ length: MAX_BOND_SLOTS + 2 }, (_, i) =>
          entry({ familiar_name: `m${i}`, slot_id: '1' }),
        ),
      ),
    )
    expect(result.filter((f) => f.slot === 'bond')).toHaveLength(MAX_BOND_SLOTS)
    expect(result.filter((f) => f.slot === null)).toHaveLength(2)
  })

  it('合法的狀態原封不動', () => {
    const result = familiarsFromApi(
      data([
        entry({ familiar_name: 'a', summoned_flag: 'true' }),
        entry({ familiar_name: 'b', slot_id: '1' }),
        entry({ familiar_name: 'c', slot_id: '2' }),
      ]),
    )
    expect(result.map((f) => f.slot)).toEqual(['summon', 'bond', 'bond'])
  })
})
