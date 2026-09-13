// 潛能詞條表。
//
// 測資直接取自遊戲／站方的畫面截圖，而不是拿程式算出來的結果反過來當期望值 ——
// 「適用標記 → 部位」那層對應是我們自己寫的，沒有外部答案就等於沒驗證。
import { describe, expect, it } from 'vitest'
import {
  EQUIP_TYPES,
  RANK_LABELS,
  equipTypeOf,
  hasPotential,
  potentialLines,
} from '@/building/data/potentials'
import siteLegendary from './fixtures/cubeSiteLegendary.json'

const textsOf = (lines: ReturnType<typeof potentialLines>) => lines.map((l) => l.text)

describe('potentialLines — 機器心臟 Lv.200 傳說', () => {
  // 站方機率查詢頁（機器心臟／200／傳說／恢復方塊）列出的九條
  it('主潛能與查詢頁完全一致', () => {
    const got = textsOf(potentialLines('heart', 200, 'legendary', 'main'))
    expect(new Set(got)).toEqual(
      new Set([
        'STR +13%',
        'DEX +13%',
        'INT +13%',
        'LUK +13%',
        '最大HP +13%',
        '最大MP +13%',
        '全屬性 +10%',
        '被擊中時有10%機率無視20%傷害',
        '被擊中時有10%機率無視40%傷害',
      ]),
    )
  })

  it('心臟沒有攻擊力%／爆擊傷害這類武器與防具的詞條', () => {
    const got = textsOf(potentialLines('heart', 200, 'legendary', 'main'))
    expect(got.some((t) => t.includes('魔法攻擊力'))).toBe(false)
    expect(got.some((t) => t.includes('爆擊傷害'))).toBe(false)
  })

  it('附加潛能是另一組詞條，不是主潛能那組', () => {
    // 站方查詢頁（機器心臟／200／傳說／珍貴附加方塊）的前幾條
    const got = textsOf(potentialLines('heart', 200, 'legendary', 'additional'))
    for (const expected of [
      'STR +20',
      'INT +20',
      '最大HP +360',
      '物理攻擊力 +16',
      '魔法攻擊力 +16',
      'INT +8%',
      '最大HP +11%',
      '全屬性 +6%',
      '以角色等級為準每9級 INT +2',
    ]) {
      expect(got).toContain(expected)
    }
    // 主潛能的 13% 不該出現在附加
    expect(got).not.toContain('INT +13%')
  })
})

describe('等級會改變數值', () => {
  it('INT% 在 151 級以上比較高', () => {
    const high = potentialLines('hat', 200, 'legendary').find((l) => l.name === 'INT%')
    const low = potentialLines('hat', 120, 'legendary').find((l) => l.name === 'INT%')
    expect(high?.x).toBe(13)
    expect(low?.x).toBe(12)
  })

  it('等級低於門檻就查不到值，不會回傳這條', () => {
    // 「被擊中時有10%機率無視40%傷害」需求等級 40
    const low = textsOf(potentialLines('heart', 30, 'legendary'))
    expect(low.some((t) => t.includes('無視40%傷害'))).toBe(false)
  })
})

describe('部位適用', () => {
  it('武器吃得到武器專用，防具吃不到', () => {
    const weapon = textsOf(potentialLines('primary-weapon', 200, 'legendary'))
    const hat = textsOf(potentialLines('hat', 200, 'legendary'))
    expect(weapon.some((t) => t.includes('BOSS'))).toBe(true)
    expect(hat.some((t) => t.includes('BOSS'))).toBe(false)
  })

  it('套服同時吃上衣與下衣的詞條', () => {
    const overall = potentialLines('overall', 170, 'legendary')
    const top = potentialLines('top', 250, 'legendary')
    // 上衣專用的詞條在套服上也查得到
    for (const line of top) {
      if (line.name === 'MaxHP%') expect(overall.some((l) => l.name === 'MaxHP%')).toBe(true)
    }
  })

  it('認不出的部位回空陣列，不要硬湊一份清單', () => {
    expect(potentialLines('圖騰', 200, 'legendary')).toEqual([])
  })
})

describe('hasPotential — 沒有潛能欄的部位不該顯示潛能 UI', () => {
  it('表上有的部位都有主潛能與附加潛能', () => {
    expect(hasPotential('hat')).toBe(true)
    expect(hasPotential('hat', 'additional')).toBe(true)
    expect(hasPotential('primary-weapon')).toBe(true)
  })

  it('表上沒有的部位一律沒有', () => {
    // 圖騰、寶石、稱號、機器人、口袋道具都不在站方的裝備種類表裡
    for (const part of ['圖騰', '寶石', 'title', 'android', 'pocket']) {
      expect(hasPotential(part)).toBe(false)
    }
  })

  it('每個部位都查得到自己的定義', () => {
    for (const t of EQUIP_TYPES) {
      expect(equipTypeOf(t.subcategory)?.name).toBe(t.name)
    }
  })
})

describe('對照站方查詢頁：21 個部位的傳說主潛能', () => {
  // 「適用標記 → 部位」那層是我們自己推的，只有逐部位比對才知道推對沒有。
  // 實際就靠這組抓到兩個錯：肩膀與腰帶掛在 accessory 卻吃防具詞條，
  // 胸章與機器心臟掛在 other 也吃防具詞條。
  for (const [subcategory, { level, lines }] of Object.entries(
    siteLegendary as unknown as Record<string, { level: number; lines: string[] }>,
  )) {
    if (subcategory.startsWith('_')) continue
    it(`${subcategory}（Lv.${level}）`, () => {
      const got = potentialLines(subcategory, level, 'legendary').map((l) => l.text)
      expect(new Set(got)).toEqual(new Set(lines))
    })
  }
})

describe('階級名稱', () => {
  it('罕見是 unique 不是 epic', () => {
    // 對錯的話整份數值會差一階：unique 的 INT% 是 10%、legendary 才是 13%
    expect(RANK_LABELS.unique).toBe('罕見')
    expect(RANK_LABELS.legendary).toBe('傳說')
    expect(potentialLines('hat', 200, 'unique').find((l) => l.name === 'INT%')?.x).toBe(10)
    expect(potentialLines('hat', 200, 'legendary').find((l) => l.name === 'INT%')?.x).toBe(13)
  })
})
