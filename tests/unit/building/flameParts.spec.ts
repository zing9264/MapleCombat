// 星火部位表。
import { describe, expect, it } from 'vitest'
import { canFlame } from '@/building/data/flameParts'
import { hasPotential } from '@/building/data/potentials'
import { subcategoryOf } from '@/building/data/partSubcategory'

describe('canFlame', () => {
  it('機器心臟不能上星火', () => {
    // 遊戲內 tooltip 直接寫「追加屬性 無法強化」
    expect(canFlame('機器心臟')).toBe(false)
  })

  it('一般防具、飾品、武器可以', () => {
    for (const part of ['帽子', '上衣', '褲/裙', '鞋子', '手套', '披風', '墜飾', '腰帶', '長杖']) {
      expect(canFlame(part)).toBe(true)
    }
  })

  it('口袋道具可以上星火，但沒有潛能欄 —— 兩份名單不能互相推', () => {
    // 同步下來的受詛咒的青魔導書帶著 int +30 的星火，潛能表裡卻沒有口袋道具
    expect(canFlame('口袋道具')).toBe(true)
    expect(subcategoryOf('口袋道具')).toBeNull()
  })

  it('機器心臟反過來：有潛能欄卻不能上星火', () => {
    expect(hasPotential(subcategoryOf('機器心臟') ?? '')).toBe(true)
    expect(canFlame('機器心臟')).toBe(false)
  })

  it('圖騰、寶石、勳章、胸章、徽章都不行', () => {
    for (const part of ['圖騰', '寶石', '勳章', '胸章', '徽章', '輔助特殊技能戒指']) {
      expect(canFlame(part)).toBe(false)
    }
  })
})
