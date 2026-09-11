import { describe, expect, it } from 'vitest'
import { activeTiers, countSetPieces, hasSetTiers } from '@/building/data/equipmentSets'

/**
 * 283 級主教「藜樂拌楓糖」實際穿戴的 29 件裝備（取自 API item-equipment）。
 * 期望的套裝件數取自遊戲內套裝效果視窗，而非 API 的 total_set_count ——
 * 後者實測兩個方向都會錯。
 */
const EQUIPPED = [
  '神祕冥界幽靈魔法帽', // 帽子
  '口紅控制器標誌', // 臉飾
  '附有魔力的眼罩', // 眼飾
  '頂級培羅德耳環', // 耳環
  '永恆法師長袍', // 上衣
  '永恆法師褲', // 褲/裙
  '航海師法師鞋', // 鞋子
  '神祕冥界幽靈魔導士手套', // 手套
  '航海師法師斗篷', // 披風
  '惡魔賢者盾', // 盾牌
  '創世長杖', // 長杖
  '永續戒指', // 戒指
  '巨大的恐怖', // 戒指
  '天上的氣息', // 戒指
  '頂級培羅德戒指', // 戒指
  '頂級培羅德烙印墜飾', // 墜飾
  '混沌貝倫殺手', // 勳章
  '頂級培羅德烙印腰帶', // 腰帶
  '航海師法師護肩', // 肩膀裝飾
  '受詛咒的青魔導書', // 口袋道具
  '菇菇機器人專用心臟', // 機器心臟
  'Sunday胸章', // 胸章
  '黃金楓葉徽章', // 徽章
  '苦痛的根源', // 墜飾
  '規範戒指', // 輔助特殊技能戒指
  '輪迴碑石', // 圖騰
  '萬事的痕跡', // 圖騰
  '阿德勒的痕跡', // 圖騰
  '伊妮絲的寶玉', // 寶石
]

describe('countSetPieces — 對照遊戲內套裝視窗', () => {
  const { counts, unknownItems } = countSetPieces(EQUIPPED)

  it('永恆套裝算到 3 件（API 只給 2，漏算創世長杖）', () => {
    expect(counts['永恆套裝(法師)']).toBe(3)
  })

  it('航海師套裝算到 4 件（API 只給 3，漏算以幸運道具計入的創世長杖）', () => {
    expect(counts['航海師套裝(法師)']).toBe(4)
  })

  it('神祕冥界套裝算到 2 件（API 多算成 3）', () => {
    expect(counts['神祕冥界套裝(法師)']).toBe(2)
  })

  it('頂級培羅德套裝算到 4 件', () => {
    expect(counts['頂級培羅德套裝']).toBe(4)
  })

  it('漆黑BOSS套裝算到 5 件', () => {
    expect(counts['漆黑BOSS套裝']).toBe(5)
  })

  it('死後世界的的痕跡算到 2 件', () => {
    expect(counts['死後世界的的痕跡']).toBe(2)
  })

  it('創世長杖同時計入永恆與航海師兩組', () => {
    const single = countSetPieces(['創世長杖'])
    expect(single.counts['永恆套裝(法師)']).toBe(1)
    expect(single.counts['航海師套裝(法師)']).toBe(1)
  })

  it('查不到的裝備會被回報，不會靜默略過', () => {
    // 少算一件就可能少掉一整階套裝效果，必須讓使用者看得到
    expect(unknownItems).toContain('惡魔賢者盾')
    expect(unknownItems).toContain('混沌貝倫殺手')
    expect(unknownItems).not.toContain('創世長杖')
  })

  it('空清單不會炸', () => {
    const empty = countSetPieces([])
    expect(empty.counts).toEqual({})
    expect(empty.unknownItems).toEqual([])
  })
})

describe('SET_TIERS — 對照先前完全吻合的對帳結果', () => {
  /**
   * 這組期望值來自那次七項全中的對帳：以遊戲內套裝視窗確認的件數
   * （永恆 3、航海師 4、神祕冥界 2、頂級培羅德 4、漆黑BOSS 5）計算，
   * 套裝合計必須是全屬性 +150、攻擊力/魔力 +260、Boss傷 +100%。
   *
   * 階層表是人工從截圖抄的，這個測試就是抄錯的防線。
   */
  const REAL_COUNTS: Record<string, number> = {
    '永恆套裝(法師)': 3,
    '航海師套裝(法師)': 4,
    '神祕冥界套裝(法師)': 2,
    頂級培羅德套裝: 4,
    漆黑BOSS套裝: 5,
    死後世界的的痕跡: 2,
    小小時光音樂會套組: 2,
  }

  function totalOf(key: 'allStat' | 'magicPower' | 'attackPower', kind: 'flat' | 'percent') {
    let sum = 0
    for (const [setName, count] of Object.entries(REAL_COUNTS)) {
      for (const tier of activeTiers(setName, count)) {
        sum += Number(tier[kind]?.[key] ?? 0)
      }
    }
    return sum
  }

  function bossDamageTotal() {
    let sum = 0
    for (const [setName, count] of Object.entries(REAL_COUNTS)) {
      for (const tier of activeTiers(setName, count)) sum += Number(tier.percent?.bossDamage ?? 0)
    }
    return sum
  }

  it('全屬性合計 +150', () => {
    expect(totalOf('allStat', 'flat')).toBe(150)
  })

  it('魔力與攻擊力合計都是 +260', () => {
    expect(totalOf('magicPower', 'flat')).toBe(260)
    expect(totalOf('attackPower', 'flat')).toBe(260)
  })

  it('Boss 傷害合計 +100%', () => {
    expect(bossDamageTotal()).toBe(100)
  })

  it('未達標的階層不會生效', () => {
    // 死後世界的的痕跡需要 3 件，目前只有 2 件
    expect(activeTiers('死後世界的的痕跡', 2)).toHaveLength(0)
    expect(activeTiers('死後世界的的痕跡', 3)).toHaveLength(1)
  })

  it('小小時光音樂會只給技能，不貢獻任何能力值', () => {
    expect(activeTiers('小小時光音樂會套組', 3)).toHaveLength(0)
    expect(hasSetTiers('小小時光音樂會套組')).toBe(true)
  })

  it('未收錄的套裝會回報，讓呼叫端知道要退回 API 資料', () => {
    expect(hasSetTiers('不存在的套裝')).toBe(false)
    expect(activeTiers('不存在的套裝', 5)).toHaveLength(0)
  })
})

describe('其他職業的同系列裝備', () => {
  it('劍士穿四件永恆裝也算得出 4 件', () => {
    const { counts } = countSetPieces(['永恆劍士頭盔', '永恆劍士鎧甲', '永恆劍士褲', '永恆劍士鞋'])
    expect(counts['永恆套裝(法師)']).toBe(4)
  })

  it('同前綴但不屬於套裝的道具不會被誤算', () => {
    // 永恆火焰戒指、永恆時間徽章是獨立道具，只是名字剛好以「永恆」開頭
    const { counts, unknownItems } = countSetPieces(['永恆火焰戒指', '永恆時間徽章'])
    expect(counts['永恆套裝(法師)']).toBeUndefined()
    expect(unknownItems).toHaveLength(2)
  })

  it('套裝的武器欄涵蓋各職業武器', () => {
    expect(countSetPieces(['神祕冥界幽靈長杖']).counts['神祕冥界套裝(法師)']).toBe(1)
    expect(countSetPieces(['神祕冥界幽靈之弓']).counts['神祕冥界套裝(法師)']).toBe(1)
    expect(countSetPieces(['航海師調節器']).counts['航海師套裝(法師)']).toBe(1)
  })
})
