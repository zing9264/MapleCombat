import { describe, expect, it } from 'vitest'
import { countSetPieces } from '@/building/data/equipmentSets'

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
